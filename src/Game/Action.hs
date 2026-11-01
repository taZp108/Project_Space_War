-- | Luat cua tung action: kiem tra dieu kien, tru chi phi, cap nhat trang thai.
--
-- Module nay khong lo chuyen luot hay kiem tra thang/thua (viec cua "Game.Turn").
module Game.Action
    ( performAction
    , removeFirst
    , checkObjectives
    , inZoneOfType
    , wormholeAt
    , crateAt
    , zoneContains
    ) where

import Control.Monad (unless, when)
import Data.List (sortOn, maximumBy, find)
import Data.Ord (comparing)
import Data.Maybe (fromMaybe, isJust)
import qualified Data.Map.Strict as Map
import System.Random (StdGen, randomR)

import Game.Config
import Game.Generate (pickDistinct, pickWeightedResource, generateAugments)
import Game.State
import Game.Types
import Game.World

-- | Thuc hien mot action cho nguoi choi. Khong kiem tra luot (viec cua
-- "Game.Turn"). Tra ve loi neu khong hop le, hoac trang thai moi va bao cao.
performAction
    :: Config -> PlayerId -> Action -> GameState
    -> Either GameError (GameState, ActionReport)
performAction cfg pid action gs = case action of
    Move dir       -> doMove cfg pid dir gs
    MoveTo target  -> doMoveTo cfg pid target gs
    Observe        -> doScanArea (cfgCostObserve cfg) (playerObserveRadius cfg (getPlayer pid gs)) True pid gs
    ScanArea       -> doScanArea (cfgCostScanArea cfg) (playerScanRadius cfg (getPlayer pid gs)) False pid gs
    ScanNearest    -> doScanNearest cfg pid gs
    ScanOpponent   -> doScanOpponent cfg pid gs
    Mine res       -> doMine cfg pid res gs
    MineRandom     -> doMineRandom cfg pid gs
    Craft item     -> doCraft cfg pid item gs
    UseItem item   -> doUseItem cfg pid item gs
    Deposit        -> doDeposit cfg pid gs
    Recharge res n -> doRecharge cfg pid res n gs
    EndTurn        -> Right (gs, report TurnEnded)
    OpenCrate        -> doOpenCrate cfg pid gs
    ClaimObjective i -> doClaimObjective cfg pid i gs
    InteractMonolith -> doInteractMonolith cfg pid gs
    ActivateBeacon   -> doActivateBeacon cfg pid gs

-- | Bao cao khong kem thong bao cho doi thu.
report :: ActionResult -> ActionReport
report r = ActionReport r Nothing

-- | Tru AP va battery. Loi neu khong du.
payCost :: Cost -> Player -> Either GameError Player
payCost (Cost ap battery) p
    | playerAP p < ap           = Left NotEnoughAP
    | playerBattery p < battery = Left NotEnoughBattery
    | otherwise = Right p
        { playerAP      = playerAP p - ap
        , playerBattery = playerBattery p - battery
        , playerTrackers = (playerTrackers p)
            { otBatterySpentThisTurn = otBatterySpentThisTurn (playerTrackers p) + battery
            }
        }

toKnown :: Planet -> KnownPlanet
toKnown pl = KnownPlanet (planetPos pl) (planetType pl) Nothing Nothing



-- | Them mot hanh tinh vao danh sach da kham pha.
learn :: Planet -> Player -> Player
learn pl p = p { playerKnown = Map.insert (planetId pl) (toKnown pl) (playerKnown p) }

-- | Neu dang dung tren mot hanh tinh thi tu kham pha no.
discoverHere :: GameState -> Player -> Player
discoverHere gs p = maybe p (`learn` p) (planetAt (playerPos p) gs)

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPERS: zones, wormholes, crates, path
-- ═══════════════════════════════════════════════════════════════════════════

-- | Kiem tra 1 Pos co nam trong zone khong.
zoneContains :: Zone -> Pos -> Bool
zoneContains (Zone _ _ shape center) pos = case shape of
    ZoneCircle r -> distance center pos <= r
    ZoneRect w h ->
        let Pos cx cy = center
            Pos px py = pos
            hw = w `div` 2
            hh = h `div` 2
        in px >= cx - hw && px <= cx + hw && py >= cy - hh && py <= cy + hh

-- | Pos co nam trong zone loai ty khong.
inZoneOfType :: ZoneType -> GameState -> Pos -> Bool
inZoneOfType ty gs pos =
    any (\z -> zoneType z == ty && zoneContains z pos) (Map.elems (gsZones gs))

-- | Tim zone tai pos (uu tien thu tu Jamming > Radiation > Swamp > ZeroG > Gold).
findZoneAt :: GameState -> Pos -> Maybe ZoneType
findZoneAt gs pos =
    find (\ty -> inZoneOfType ty gs pos)
         [ZoneJamming, ZoneRadiation, ZoneSwamp, ZoneZeroG, ZoneGoldRush]

-- | Tim wormhole o pos.
wormholeAt :: Pos -> GameState -> Maybe Wormhole
wormholeAt pos gs = find ((== pos) . wormholePos) (Map.elems (gsWormholes gs))

-- | Tim crate o pos.
crateAt :: Pos -> GameState -> Maybe Crate
crateAt pos gs = find ((== pos) . cratePos) (Map.elems (gsCrates gs))

-- | Duong thang tu A den B (ngang truoc, doc sau).
straightPath :: Pos -> Pos -> [Pos]
straightPath (Pos x1 y1) (Pos x2 y2) =
    [Pos x y1 | x <- stepRange x1 x2] ++ [Pos x2 y | y <- stepRange y1 y2]
  where
    stepRange a b
        | a < b = [a+1..b]
        | a > b = [a-1, a-2 .. b]
        | otherwise = []

-- | Chuyen path thanh list huong.
pathDirs :: Pos -> [Pos] -> [Direction]
pathDirs _ [] = []
pathDirs prev (p:ps) = dirBetween prev p : pathDirs p ps
  where
    dirBetween (Pos ax ay) (Pos bx by)
        | bx > ax = DirRight
        | bx < ax = DirLeft
        | by > ay = DirDown
        | by < ay = DirUp
        | otherwise = DirRight

-- | Tinh AP va battery cho ca path, ap dung zone modifiers (Zero-G / Swamp).
pathCost :: GameState -> Cost -> Int -> Pos -> [Pos] -> Cost
pathCost gs (Cost baseAp baseBat) eventMult src path =
    let stepSrcs = src : init path
        stepDsts = path
        steps = zip stepSrcs stepDsts
        nonZG  = length [ () | (_, d) <- steps, not (inZoneOfType ZoneZeroG gs d) ]
        zg     = length [ () | (_, d) <- steps, inZoneOfType ZoneZeroG gs d ]
        nonSw  = length [ () | (_, d) <- steps, not (inZoneOfType ZoneSwamp gs d) ]
        sw     = length [ () | (_, d) <- steps, inZoneOfType ZoneSwamp gs d ]
        ap  = baseAp * nonZG + (baseAp * zg + 1) `div` 2
        bat = (baseBat * nonSw + baseBat * 2 * sw) * eventMult
    in Cost ap bat

-- | Tinh resource tu Gold Rush khi di qua path.
walkPathRewards :: Config -> GameState -> Pos -> [Pos] -> StdGen -> (Resources, StdGen)
walkPathRewards cfg gs src path = go (src : init path) path Map.empty
  where
    go _ [] acc g = (acc, g)
    go (s:ss) (d:ds) acc g
      | inZoneOfType ZoneGoldRush gs d && not (inZoneOfType ZoneGoldRush gs s) =
          let (res, g1) = pickWeightedResource cfg g
              (n, g2) = randomR (cfgGoldResourceAmountMin cfg, cfgGoldResourceAmountMax cfg) g1
          in go (d:ss) ds (Map.insertWith (+) res n acc) g2
      | otherwise = go (d:ss) ds acc g
    go [] _ acc g = (acc, g)

doMove :: Config -> PlayerId -> Direction -> GameState -> Either GameError (GameState, ActionReport)

doMove cfg pid dir gs = do
    let player = getPlayer pid gs
        target = movePos dir (playerPos player)
    doMoveTo cfg pid target gs

doMoveTo :: Config -> PlayerId -> Pos -> GameState -> Either GameError (GameState, ActionReport)
doMoveTo cfg pid target gs = do
    let player = getPlayer pid gs
        src = playerPos player
    unless (inBounds cfg target) (Left OutOfBounds)
    let straight = straightPath src target
        stopIdx = case [ i | (i, p) <- zip [1 :: Int ..] straight, isJust (wormholeAt p gs) ] of
                    (i:_) -> i
                    []    -> length straight
        actualPath = take stopIdx straight
        stopPos = if null actualPath then src else last actualPath
        Cost baseAp baseBat = playerMoveCost cfg player
        eventMult = if gsActiveCanonEvent gs == Just CE_ReverseGravity then 2 else 1
        cost = pathCost gs (Cost baseAp baseBat) eventMult src actualPath
    paid <- payCost cost player
    let (goldRes, g') = walkPathRewards cfg gs src actualPath (gsRng gs)
        gs1 = gs { gsRng = g' }
        movedTracker = (playerTrackers paid)
            { otCellsMoved = otCellsMoved (playerTrackers paid) + length actualPath
            , otDidMove = True
            , otMoveSequence = otMoveSequence (playerTrackers paid) ++ pathDirs src actualPath
            }
        pBase = paid { playerCargo = addResources (playerCargo paid) goldRes
                     , playerTrackers = movedTracker }
    case wormholeAt stopPos gs of
        Just wh ->
            let partnerId = wormholePairedWith wh
                partner = Map.lookup partnerId (gsWormholes gs)
                dest = maybe stopPos wormholePos partner
                newKnown = case partner of
                    Just pr -> Map.insert (wormholeId pr) pr
                                 (Map.insert (wormholeId wh) wh (playerKnownWormholes pBase))
                    Nothing -> Map.insert (wormholeId wh) wh (playerKnownWormholes pBase)
                p1 = pBase { playerPos = dest
                           , playerKnownWormholes = newKnown
                           , playerTrackers = (playerTrackers pBase)
                               { otWormholesUsedThisTurn = otWormholesUsedThisTurn (playerTrackers pBase) + 1 }
                           }
                p2 = discoverHere gs1 p1
            in Right (setPlayer pid p2 gs1, report (WormholeEntered stopPos dest))
        Nothing ->
            let p1 = pBase { playerPos = stopPos }
                p2 = discoverHere gs1 p1
            in case findZoneAt gs1 stopPos of
                Just ty -> Right (setPlayer pid p2 gs1, report (ZoneEntered ty))
                Nothing -> Right (setPlayer pid p2 gs1, report (Moved stopPos))

-- | Dung chung cho Observe va ScanArea, chi khac ban kinh va chi phi.
doScanArea :: Cost -> Int -> Bool -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doScanArea cost radius revealDetails pid gs = do
    let player = getPlayer pid gs
    when (inZoneOfType ZoneJamming gs (playerPos player)) (Left InJammedZone)
    let visible =
            [ pl
            | pl <- Map.elems (gsPlanets gs)
            , withinRadius radius (playerPos player) (planetPos pl)
            ]
        wormholesInRange =
            [ wh
            | wh <- Map.elems (gsWormholes gs)
            , withinRadius radius (playerPos player) (wormholePos wh)
            ]
    paid <- payCost cost player
    let learnFn pl p =
            let existing = Map.lookup (planetId pl) (playerKnown p)
                base = maybe (toKnown pl) id existing
                updated = if revealDetails
                          then base { knownStock = Just (planetStock pl), knownEvent = planetEventType pl }
                          else base
            in p { playerKnown = Map.insert (planetId pl) updated (playerKnown p) }
        learned = foldr learnFn paid visible
        learned' = foldr (\wh p ->
                        p { playerKnownWormholes = Map.insert (wormholeId wh) wh (playerKnownWormholes p) })
                     learned wormholesInRange
        learned'' = learned' { playerTrackers = (playerTrackers learned')
                        { otScansThisTurn = otScansThisTurn (playerTrackers learned') + 1
                        , otDidScan = True
                        } }
        resultPlanets = map (\pl -> maybe (toKnown pl) id (Map.lookup (planetId pl) (playerKnown learned''))) visible
    Right (setPlayer pid learned'' gs, report (PlanetsFound resultPlanets))

doScanNearest :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doScanNearest cfg pid gs = do
    let player = getPlayer pid gs
    when (inZoneOfType ZoneJamming gs (playerPos player)) (Left InJammedZone)
    let here = playerPos player
        candidates = [ pl | pl <- Map.elems (gsPlanets gs), totalUnits (planetStock pl) > 0 ]
        nearest = case sortOn (\pl -> (distance here (planetPos pl), planetId pl)) candidates of
            []       -> Nothing
            (pl : _) -> Just (compassFrom here (planetPos pl), distance here (planetPos pl))
    paid <- payCost (cfgCostScanNearest cfg) player
    let paid' = paid { playerTrackers = (playerTrackers paid)
                        { otScansThisTurn = otScansThisTurn (playerTrackers paid) + 1
                        , otDidScan = True
                        } }
    Right (setPlayer pid paid' gs, report (NearestPlanet nearest))

doScanOpponent :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doScanOpponent cfg pid gs = do
    let player = getPlayer pid gs
        opponent = getPlayer (otherPlayer pid) gs
        -- Neu doi thu trong Swamp, tra ve 'Here' de danh lac (khong the thay).
        inSwamp = inZoneOfType ZoneSwamp gs (playerPos opponent)
        direction = if inSwamp then Here else compassFrom (playerPos player) (playerPos opponent)
    when (inZoneOfType ZoneJamming gs (playerPos player)) (Left InJammedZone)
    paid <- payCost (cfgCostScanOpponent cfg) player
    let paid' = paid { playerTrackers = (playerTrackers paid)
                        { otScansThisTurn = otScansThisTurn (playerTrackers paid) + 1
                        , otDidScan = True
                        } }
    Right ( setPlayer pid paid' gs
          , ActionReport (OpponentDirection direction) (Just YouWereScanned) )

doMine :: Config -> PlayerId -> ResourceType -> GameState -> Either GameError (GameState, ActionReport)
doMine cfg pid res gs = do
    let player = getPlayer pid gs
    planet <- maybe (Left NotOnPlanet) Right (planetAt (playerPos player) gs)
    let stock = Map.findWithDefault 0 res (planetStock planet)
        free = playerMaxCargo cfg player - totalUnits (playerCargo player)
    when (stock <= 0) (Left PlanetHasNoSuchResource)
    when (free <= 0) (Left CargoFull)
    paid <- payCost (cfgCostMine cfg) player
    let baseAmount = minimum [cfgMineAmount cfg, stock, free]
        inRad = inZoneOfType ZoneRadiation gs (playerPos player)
        amount = if inRad
                 then min stock (min free ((baseAmount * (100 + cfgRadiationMineBonus cfg)) `div` 100))
                 else baseAmount
        newStock = Map.filter (> 0) (Map.insert res (stock - amount) (planetStock planet))
        planet' = planet { planetStock = newStock }
        cargo' = Map.insertWith (+) res amount (playerCargo paid)
        p1 = learn planet' (paid { playerCargo = cargo' })
        p2 = p1 { playerTrackers = (playerTrackers p1)
                    { otMinesThisTurn = otMinesThisTurn (playerTrackers p1) + 1
                    , otDidMine = True
                    , otResourcesMinedThisTurn = otResourcesMinedThisTurn (playerTrackers p1) + amount
                    , otUniquePlanetsVisited = let pid' = planetId planet
                                               in if pid' `elem` otUniquePlanetsVisited (playerTrackers p1)
                                                  then otUniquePlanetsVisited (playerTrackers p1)
                                                  else pid' : otUniquePlanetsVisited (playerTrackers p1)
                    , otUniquePlanetTypes = let pt = planetType planet
                                            in if pt `elem` otUniquePlanetTypes (playerTrackers p1)
                                               then otUniquePlanetTypes (playerTrackers p1)
                                               else pt : otUniquePlanetTypes (playerTrackers p1)
                    } }
        gs' = setPlayer pid p2 (gs { gsPlanets = Map.insert (planetId planet) planet' (gsPlanets gs) })
    Right (gs', report (Mined res amount))

doMineRandom :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doMineRandom cfg pid gs = do
    let player = getPlayer pid gs
    planet <- maybe (Left NotOnPlanet) Right (planetAt (playerPos player) gs)
    let available = [(r,n) | (r,n) <- Map.toList (planetStock planet), n > 0]
        free = playerMaxCargo cfg player - totalUnits (playerCargo player)
    when (null available) (Left PlanetHasNoSuchResource)
    when (free <= 0) (Left CargoFull)
    paid <- payCost (cfgCostMine cfg) player
    -- Random số lượng cho TẤT CẢ tài nguyên
    let (minedList, g1) = randomMineAll available free (playerLuck player) (cfgResourceRarity cfg) (gsRng gs)
        minedMap = Map.fromList [(r, amt) | (r, amt) <- minedList, amt > 0]
        stock' = foldr (\(r, amt) m -> Map.update (\n -> let x = n - amt in if x <= 0 then Nothing else Just x) r m) (planetStock planet) minedList
        midasChance = case [ augRarity o | o <- playerAugments player, augType o == Aug_Midas ] of
                        (r:_) -> case r of Silver -> 20; Gold -> 50; Diamond -> 100
                        [] -> 0
        (midasRoll, g1') = randomR (1, 100 :: Int) g1
        midasMap = if midasRoll <= midasChance then Map.singleton PinkDiamond 1 else Map.empty
        finalMinedMap = Map.unionWith (+) minedMap midasMap
        -- Radiation bonus: +50% tren minedMap (khong tinh Midas)
        inRad = inZoneOfType ZoneRadiation gs (playerPos player)
        radBonusMap = if inRad
                      then Map.map (\n -> (n * cfgRadiationMineBonus cfg) `div` 100) minedMap
                      else Map.empty
        radBonusCapped = Map.mapWithKey (\r n ->
                            let avail = Map.findWithDefault 0 r stock'
                            in min n avail
                         ) radBonusMap
        stock'' = foldr (\(r, amt) m -> Map.update (\n -> let x = n - amt in if x <= 0 then Nothing else Just x) r m) stock' (Map.toList radBonusCapped)
        planetRad = planet { planetStock = stock'' }
        finalMinedMapRad = Map.unionWith (+) finalMinedMap radBonusCapped
        cargo' = Map.unionWith (+) (playerCargo paid) finalMinedMapRad
        totalMinedNow = totalUnits finalMinedMapRad
        minedPlayer0 = learn planetRad (paid { playerCargo = cargo' })
        minedPlayer = minedPlayer0 { playerTrackers = (playerTrackers minedPlayer0)
                        { otMinesThisTurn = otMinesThisTurn (playerTrackers minedPlayer0) + 1
                        , otDidMine = True
                        , otResourcesMinedThisTurn = otResourcesMinedThisTurn (playerTrackers minedPlayer0) + totalMinedNow
                        , otUniquePlanetsVisited = let pid' = planetId planet
                                                   in if pid' `elem` otUniquePlanetsVisited (playerTrackers minedPlayer0)
                                                      then otUniquePlanetsVisited (playerTrackers minedPlayer0)
                                                      else pid' : otUniquePlanetsVisited (playerTrackers minedPlayer0)
                        , otUniquePlanetTypes = let pt = planetType planet
                                                in if pt `elem` otUniquePlanetTypes (playerTrackers minedPlayer0)
                                                   then otUniquePlanetTypes (playerTrackers minedPlayer0)
                                                   else pt : otUniquePlanetTypes (playerTrackers minedPlayer0)
                        } }

        (eventRoll, g2) = randomR (1, 100 :: Int) g1'
        trigger = not (planetEventTriggered planet) && eventRoll <= cfgPlanetEventChance cfg
        planet'' = planetRad { planetEventTriggered = planetEventTriggered planet || trigger }

        -- Lấy event đã được gán sẵn của hành tinh này (nếu có)
        selectedEvent = fromMaybe EV_Surge (planetEventType planet)

        gs0 = setPlayer pid minedPlayer (gs { gsPlanets = Map.insert (planetId planet) planet'' (gsPlanets gs), gsRng = g2 })

        (gs1, ev) = if trigger then applyPlanetEvent cfg pid selectedEvent gs0 else (gs0, Nothing)
        halvedMap = Map.map (`div` 2) minedMap
        gs2 = case ev of
                Just EV_GreedyPlanet -> undoHalfMine pid halvedMap gs1
                _ -> gs1
        finalResult = case ev of
                Nothing -> MinedAll minedMap
                Just EV_GreedyPlanet -> PlanetEventOccurred EV_GreedyPlanet (MinedAll halvedMap) False
                Just e -> PlanetEventOccurred e (MinedAll minedMap) (e == EV_SpaceAnchor)
    Right (gs2, report finalResult)

-- | Random số lượng cho từng loại tài nguyên, dừng khi hết cargo.
-- amount >= 1 cho mỗi loại (cho đến khi cargo đầy).
randomMineAll :: [(ResourceType, Int)] -> Int -> Int -> Map.Map ResourceType Int -> StdGen -> ([(ResourceType, Int)], StdGen)
randomMineAll available free luck rarityMap = go available free
  where
    go [] _ g = ([], g)
    go _ 0 g = ([], g)
    go ((r, stock) : rest) freeLeft g =
      let rarity = Map.findWithDefault 8 r rarityMap
          (roll, g1) = randomR (50, 150 :: Int) g
          baseDrop
            | rarity <= 2 = 1 + (roll `mod` 2)
            | rarity >= 7 = 5 + (roll `mod` 6)
            | otherwise   = 2 + (roll `mod` 4)
          rawAmount = max 1 ((baseDrop * (100 + max 0 luck) * roll + 9999) `div` 10000)
          amount = min stock (min freeLeft rawAmount)
          (restMined, g2) = go rest (freeLeft - amount) g1
      in ((r, amount) : restMined, g2)

-- | Hoàn trả một nửa số vừa khai thác (dùng cho EV_GreedyPlanet).
undoHalfMine :: PlayerId -> Resources -> GameState -> GameState
undoHalfMine pid returned gs =
    let p = getPlayer pid gs
        p' = p { playerCargo = foldr
                    (\(r,amt) m -> Map.update (\n -> let x = n - amt in if x <= 0 then Nothing else Just x) r m)
                    (playerCargo p) (Map.toList returned) }
        gs' = setPlayer pid p' gs
    in case planetAt (playerPos p) gs of
        Nothing -> gs'
        Just planet -> gs' { gsPlanets = Map.insert (planetId planet)
                            (planet { planetStock = Map.unionWith (+) returned (planetStock planet) })
                            (gsPlanets gs') }


-- | Cắt bớt cargo xuống còn tối đa @cap@ đơn vị. Ưu tiên giữ tài nguyên hiếm.
truncateCargo :: Int -> Resources -> Resources
truncateCargo cap rs = go cap (Map.toAscList rs) Map.empty
  where
    go _ [] acc = acc
    go free ((r,n):xs) acc
      | free <= 0 = acc
      | otherwise = let take' = min free n in go (free - take') xs (Map.insert r take' acc)


applyPlanetEvent :: Config -> PlayerId -> PlanetEvent -> GameState -> (GameState, Maybe PlanetEvent)
applyPlanetEvent cfg pid ev gs = (setPlayer pid p' gs', Just ev)
  where
    p = getPlayer pid gs
    activeItems = [IT_Teleport, IT_Battery, IT_AP, IT_BlackHole, IT_SwapPos, IT_Scarecrow, IT_Steal, IT_APBoost, IT_Magnet]
    (itemIndex, g1) = randomR (0, length activeItems - 1) (gsRng gs)
    (jamAmount, gJam) = randomR (5, 10 :: Int) g1
    p' = case ev of
      EV_LavaCore -> p { playerBattery = playerMaxBattery cfg p }
      EV_Radiation -> p
          { playerBattery = max 0 (playerBattery p - 20)
          , playerInventory = (playerInventory p)
              { invActives = take (max 0 (cfgMaxActiveSlots cfg - playerActiveSlotPenalty p))
                                (activeItems !! itemIndex : invActives (playerInventory p)) }
          }
      EV_GreedyPlanet -> p
      EV_SpaceAnchor -> p
      EV_Parasite -> p
          { playerCargo = if totalUnits (playerCargo p) < playerMaxCargo cfg p
                          then Map.insertWith (+) PinkDiamond 1 (playerCargo p)
                          else playerCargo p
          , playerActiveSlotPenalty = playerActiveSlotPenalty p + 1
          }
      EV_Mirage -> p { playerKnown = foldr (\pl -> Map.insert (planetId pl) (toKnown pl)) (playerKnown p) miragePlanets }
      EV_CargoJam ->
          let newJam = playerCargoJam p + jamAmount
              newMax = max 10 (cfgCargoCapacity cfg 
                          + 20 * Map.findWithDefault 0 IT_CargoUp (invPassives (playerInventory p))
                          - newJam)
          in p { playerCargoJam = newJam, playerCargo = truncateCargo newMax (playerCargo p) }
      EV_Surge -> p { playerBattery = min (playerMaxBattery cfg p) (playerBattery p + 10) }
    gs' = case ev of
      EV_LavaCore -> gs { gsRng = g1
                        , gsPlanets = maybe (gsPlanets gs) 
                            (\pl -> Map.insert (planetId pl) (pl { planetStock = Map.empty }) (gsPlanets gs))
                            (planetAt (playerPos p) gs) }
      EV_Mirage -> gs { gsRng = g2, gsPlanets = foldr (\pl -> Map.insert (planetId pl) pl) (gsPlanets gs) miragePlanets }
      EV_CargoJam -> gs { gsRng = gJam }
      _ -> gs { gsRng = g1 }
    near = [Pos x y | x <- [posX (playerPos p)-5 .. posX (playerPos p)+5]
                    , y <- [posY (playerPos p)-5 .. posY (playerPos p)+5]
                    , distance (playerPos p) (Pos x y) <= 5
                    , inBounds cfg (Pos x y)
                    , planetAt (Pos x y) gs == Nothing]
    (cells, g2) = pickDistinct 3 near g1
    miragePlanets = [Planet i pos Mining (Map.fromList [(Amethyst, 5)]) True Nothing | (i,pos) <- zip [nextId ..] cells]
    nextId = 1 + maximum (0 : Map.keys (gsPlanets gs))


doCraft :: Config -> PlayerId -> ItemId -> GameState -> Either GameError (GameState, ActionReport)
doCraft cfg pid item gs = do
    let player = getPlayer pid gs
        recipe = Map.findWithDefault Map.empty item (cfgItemRecipes cfg)
        discount = augmentBonus player Aug_CraftDiscount
        recipe' = if Map.null recipe then recipe else
                    let maxRes = fst $ maximumBy (comparing snd) (Map.toList recipe)
                    in Map.adjust (\n -> max 1 (n - discount)) maxRes recipe
        inv = playerInventory player
        activeLimit = max 0 (cfgMaxActiveSlots cfg - playerActiveSlotPenalty player)
    remaining <- maybe (Left NotEnoughResources) Right (removeResources (playerCargo player) recipe')
    when (itemType item == Active && length (invActives inv) >= activeLimit) (Left InventoryFull)
    let inv' = case itemType item of
          Passive -> inv { invPassives = Map.insertWith (+) item 1 (invPassives inv) }
          Active -> inv { invActives = invActives inv ++ [item] }
        p' = player { playerCargo = remaining, playerInventory = inv'
                    , playerLuck = playerLuck player + if item == IT_LuckUp then 10 else 0 }
        p'' = p' { playerTrackers = (playerTrackers p')
                    { otCraftsThisTurn = otCraftsThisTurn (playerTrackers p') + 1
                    , otCraftedItems = item : otCraftedItems (playerTrackers p')
                    , otDidCraft = True
                    } }
    Right (setPlayer pid p'' gs, report (ItemCrafted item))


doUseItem :: Config -> PlayerId -> ItemId -> GameState -> Either GameError (GameState, ActionReport)
doUseItem cfg pid item gs = do
    let player = getPlayer pid gs
        inv = playerInventory player
    when (item `notElem` invActives inv) (Left ItemUnavailable)
    let opponentId = otherPlayer pid
        opponent = getPlayer opponentId gs
        without = inv { invActives = removeFirst item (invActives inv) }
        p0 = player { playerInventory = without }
        (p', op', gs') = case item of
          IT_Teleport -> (p0 { playerPos = gsEarth gs }, opponent, gs)
          IT_Battery -> (p0 { playerBattery = min (playerMaxBattery cfg p0) (playerBattery p0 + 20) }, opponent, gs)
          IT_AP -> (p0 { playerAP = min (cfgApMax cfg) (playerAP p0 + 2) }, opponent, gs)
          IT_APBoost -> (p0 { playerAP = min (cfgApMax cfg) (playerAP p0 + 2) }, opponent, gs)
          IT_BlackHole -> let stateAfter = maybe gs (\pl -> gs { gsPlanets = Map.delete (planetId pl) (gsPlanets gs) }) (planetAt (playerPos p0) gs)
                          in (p0 { playerStorage = Map.insertWith (+) Carnelian 2 (playerStorage p0) }, opponent, stateAfter)
          IT_SwapPos -> (p0 { playerPos = playerPos opponent }, opponent { playerPos = playerPos p0 }, gs)
          IT_Scarecrow -> (p0, opponent { playerAP = max 0 (playerAP opponent - 1) }, gs)
          IT_Steal -> case invActives (playerInventory opponent) of
              [] -> (p0, opponent, gs)
              xs -> let (i, g') = randomR (0, length xs - 1) (gsRng gs)
                        stolen = xs !! i
                    in (p0, opponent { playerInventory = (playerInventory opponent) { invActives = removeFirst stolen xs } }, gs { gsRng = g' })
          IT_Magnet -> case planetAt (playerPos p0) gs of
              Nothing -> (p0, opponent, gs)
              Just pl -> let room = max 0 (playerMaxCargo cfg p0 - totalUnits (playerCargo p0))
                             takeRs = takeResources room (planetStock pl)
                             p1 = p0 { playerCargo = addResources (playerCargo p0) takeRs }
                             pl' = pl { planetStock = maybe Map.empty id (removeResources (planetStock pl) takeRs) }
                         in (p1, opponent, gs { gsPlanets = Map.insert (planetId pl) pl' (gsPlanets gs) })
          _ -> (p0, opponent, gs)
        final = setPlayer opponentId op' (setPlayer pid p' gs')
        pFinal = getPlayer pid final
        pFinal' = pFinal { playerTrackers = (playerTrackers pFinal)
                            { otItemsUsedThisTurn = otItemsUsedThisTurn (playerTrackers pFinal) + 1
                            , otDidUseItem = True
                            } }
        final' = setPlayer pid pFinal' final
    Right (final', report (ItemUsed item))

removeFirst :: Eq a => a -> [a] -> [a]
removeFirst _ [] = []
removeFirst target (x:xs) | target == x = xs | otherwise = x : removeFirst target xs

takeResources :: Int -> Resources -> Resources
takeResources capacity = go capacity . Map.toAscList
  where
    go _ [] = Map.empty
    go free _ | free <= 0 = Map.empty
    go free ((r,n):xs) = let amount = min free n in Map.insert r amount (go (free - amount) xs)

doDeposit :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doDeposit cfg pid gs = do
    let player = getPlayer pid gs
        d = distance (playerPos player) (gsEarth gs)
        cost = if d == 0 then cfgCostDepositAtEarth cfg else cfgCostDepositRemote cfg
    when (d > cfgDepositRange cfg) (Left OutOfDepositRange)
    when (totalUnits (playerCargo player) == 0) (Left CargoEmpty)
    paid <- payCost cost player
    let deposited = playerCargo paid
        player' = paid
            { playerCargo   = Map.empty
            , playerStorage = addResources (playerStorage paid) deposited
            , playerTotalDeposited  = addResources (playerTotalDeposited paid) deposited
            , playerTrackers = (playerTrackers paid)
                { otDepositsThisTurn = otDepositsThisTurn (playerTrackers paid) + 1
                , otDidDeposit = True
                } }
    Right (setPlayer pid player' gs, report (Deposited deposited))

doRecharge
    :: Config -> PlayerId -> ResourceType -> Int -> GameState
    -> Either GameError (GameState, ActionReport)
doRecharge cfg pid res n gs = do
    let player = getPlayer pid gs
    when (n <= 0) (Left InvalidAmount)
    when (playerPos player /= gsEarth gs) (Left NotAtEarth)
    when (playerBattery player >= playerMaxBattery cfg player) (Left BatteryFull)
    remaining <- maybe (Left NotEnoughResources) Right
        (removeResources (playerStorage player) (Map.singleton res n))
    paid <- payCost (cfgCostRecharge cfg) player
    let value = n * Map.findWithDefault 0 res (cfgResourceValue cfg)
        newBattery = min (playerMaxBattery cfg paid) (playerBattery paid + value * cfgRechargeRate cfg)
        gained = newBattery - playerBattery paid
        player' = paid { playerBattery = newBattery, playerStorage = remaining }
    Right (setPlayer pid player' gs, report (Recharged gained))

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 3: CRATES
-- ═══════════════════════════════════════════════════════════════════════════

doOpenCrate :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doOpenCrate cfg pid gs = do
    let player = getPlayer pid gs
    crate <- maybe (Left NoCrateHere) Right (crateAt (playerPos player) gs)
    case crateContent crate of
        CrateLoot loots ->
            let (p1, failed, g') = applyLoot cfg player loots (gsRng gs)
                p2 = p1 { playerTrackers = (playerTrackers p1)
                            { otCratesOpenedThisTurn = otCratesOpenedThisTurn (playerTrackers p1) + 1
                            } }
                -- Loot nhan duoc = nhung gi khong fail
                failedSet = [ l | (l, _) <- failed ]
                received = filter (`notElem` failedSet) loots
                gs' = setPlayer pid p2 (gs { gsCrates = Map.delete (crateId crate) (gsCrates gs)
                                            , gsRng = g' })
            in Right (gs', report (CrateOpened received))
        CrateTrap trap ->
            let (p1, gs1) = applyTrap cfg player gs trap
                p2 = p1 { playerTrackers = (playerTrackers p1)
                            { otCratesOpenedThisTurn = otCratesOpenedThisTurn (playerTrackers p1) + 1
                            } }
                gs2 = setPlayer pid p2 (gs1 { gsCrates = Map.delete (crateId crate) (gsCrates gs1) })
            in Right (gs2, report (TrapTriggered trap))

-- | Ap dung loot, tra ve (player, list loot khong lay duoc, StdGen moi).
applyLoot :: Config -> Player -> [LootItem] -> StdGen -> (Player, [(LootItem, String)], StdGen)
applyLoot cfg = go
  where
    go p [] g = (p, [], g)
    go p (l:ls) g =
        let (p', ok, g') = applyOne p l g
            (p'', fails, g'') = go p' ls g'
        in (p'', if ok then fails else (l, "no_room") : fails, g'')
    applyOne p loot g = case loot of
        LootResources rs ->
            let room = playerMaxCargo cfg p - totalUnits (playerCargo p)
                totalRs = totalUnits rs
            in if totalRs <= room
               then (p { playerCargo = addResources (playerCargo p) rs }, True, g)
               else (p, False, g)
        LootActiveItem it ->
            let inv = playerInventory p
                limit = max 0 (cfgMaxActiveSlots cfg - playerActiveSlotPenalty p)
            in if length (invActives inv) < limit
               then (p { playerInventory = inv { invActives = invActives inv ++ [it] } }, True, g)
               else (p, False, g)
        LootPassiveItem it ->
            let inv = playerInventory p
            in (p { playerInventory = inv { invPassives = Map.insertWith (+) it 1 (invPassives inv) } }, True, g)
        LootAugment r ->
            let (typeIdx, g') = randomR (0, fromEnum (maxBound :: AugmentType)) g
                aug = AugmentOffer 0 (toEnum typeIdx) r
            in (p { playerAugments = aug : playerAugments p }, True, g')

-- | Ap dung trap, tra ve (player, gameState).
applyTrap :: Config -> Player -> GameState -> TrapType -> (Player, GameState)
applyTrap cfg p gs trap = case trap of
    TrapBatteryLeak n -> (p { playerBattery = max 0 (playerBattery p - n) }, gs)
    TrapMagneticStorm n -> (p { playerBattery = max 0 (playerBattery p - n) }, gs)
    TrapItemThief -> case invActives (playerInventory p) of
        [] -> (p, gs)
        xs -> let (i, g') = randomR (0, length xs - 1) (gsRng gs)
                  stolen = xs !! i
              in (p { playerInventory = (playerInventory p) { invActives = removeFirst stolen xs } }, gs { gsRng = g' })
    TrapPassiveThief -> case Map.toList (invPassives (playerInventory p)) of
        [] -> (p, gs)
        xs -> let (i, g') = randomR (0, length xs - 1) (gsRng gs)
                  (k, _) = xs !! i
              in (p { playerInventory = (playerInventory p)
                        { invPassives = Map.update (\n -> if n <= 1 then Nothing else Just (n-1)) k
                                       (invPassives (playerInventory p)) } }, gs { gsRng = g' })
    TrapTax n -> (p { playerStorage = reduceValue cfg n (playerStorage p) }, gs)
    TrapTeleportRandom mn mx ->
        let (n, g') = randomR (mn, mx :: Int) (gsRng gs)
            (dx, g'') = randomR (-n, n) g'
            (dy, g''') = randomR (-n, n) g''
            Pos x y = playerPos p
            clamp a = max 0 (min (cfgMapWidth cfg - 1) a)
            newPos = Pos (clamp (x + dx)) (clamp (y + dy))
        in (p { playerPos = newPos }, gs { gsRng = g''' })
    TrapCargoLeak n m ->
        (p { playerCargoJam = playerCargoJam p + n
           , playerCargoPenaltyTurns = playerCargoPenaltyTurns p + m }, gs)
    TrapPlunder n -> case sortOn (negate . fst)
                            [ (Map.findWithDefault 0 r (cfgResourceValue cfg), r)
                            | (r, k) <- Map.toList (playerCargo p), k > 0 ] of
        [] -> (p, gs)
        ((_, r):_) ->
            (p { playerCargo = Map.update (\k -> if k <= n then Nothing else Just (k - n)) r (playerCargo p) }, gs)
    TrapAPDrain n -> (p { playerAP = max 0 (playerAP p - n) }, gs)
    TrapNextAPDrain n -> (p { playerNextTurnAPPenalty = playerNextTurnAPPenalty p + n }, gs)
    TrapEmptyCrate -> (p, gs)
    TrapHomecoming -> (p { playerPos = gsEarth gs }, gs)
    TrapRadiation n m ->
        (p { playerBattery = max 0 (playerBattery p - n)
           , playerStorage = reduceValue cfg m (playerStorage p) }, gs)
    TrapMiniBlackHole n -> (p { playerBattery = max 0 (playerBattery p - n) }, gs)
    TrapMixed n m k ->
        (p { playerBattery = max 0 (playerBattery p - n)
           , playerNextTurnAPPenalty = playerNextTurnAPPenalty p + m
           , playerStorage = reduceValue cfg k (playerStorage p) }, gs)

-- | Giam gia tri kho xuong bot target diem (u tien tai nguyen dat).
reduceValue :: Config -> Int -> Resources -> Resources
reduceValue cfg target rs = go target rs
  where
    go 0 r = r
    go _ r | Map.null r = r
    go rem r = case sortOn (negate . fst)
                        [ (Map.findWithDefault 0 x (cfgResourceValue cfg), x)
                        | (x, n) <- Map.toList r, n > 0 ] of
        [] -> r
        ((v, x):_) -> go (max 0 (rem - v))
                        (Map.update (\n -> if n <= 1 then Nothing else Just (n-1)) x r)

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 4: OBJECTIVES
-- ═══════════════════════════════════════════════════════════════════════════

doClaimObjective :: Config -> PlayerId -> Int -> GameState -> Either GameError (GameState, ActionReport)
doClaimObjective cfg pid targetObjId gs = do
    let player = getPlayer pid gs
    case find ((== targetObjId) . objId) (playerObjectives player) of
        Nothing -> Left ObjectiveNotFound
        Just obj
          | objClaimed obj -> Left ObjectiveAlreadyClaimed
          | not (objCompleted obj) -> Left ObjectiveNotComplete
          | otherwise ->
              let (p1, g') = applyObjectiveReward cfg obj player (gsRng gs)
                  p2 = p1 { playerObjectives =
                              map (\o -> if objId o == targetObjId then o { objClaimed = True } else o)
                                  (playerObjectives p1) }
              in Right (setPlayer pid p2 (gs { gsRng = g' }), report (ObjectiveClaimed targetObjId (objReward obj)))



applyObjectiveReward :: Config -> Objective -> Player -> StdGen -> (Player, StdGen)
applyObjectiveReward cfg obj p g =
    foldl (\(p', g') r -> applyReward cfg r p' g') (p, g) (flattenReward (objReward obj))

-- | Flatten nested RewardCombo thanh list phang.
flattenReward :: ObjectiveReward -> [ObjectiveReward]
flattenReward (RewardCombo rs) = concatMap flattenReward rs
flattenReward r = [r]

applyReward :: Config -> ObjectiveReward -> Player -> StdGen -> (Player, StdGen)
applyReward cfg r p g = case r of
    RewardBattery n -> (p { playerBattery = min (playerMaxBattery cfg p) (playerBattery p + n) }, g)
    RewardResources rs -> (p { playerCargo = addResources (playerCargo p) rs }, g)
    RewardAugment rar ->
        let (typeIdx, g') = randomR (0, fromEnum (maxBound :: AugmentType)) g
            aug = AugmentOffer 0 (toEnum typeIdx) rar
        in (p { playerAugments = aug : playerAugments p }, g')
    RewardActiveItem it ->
        let inv = playerInventory p
            limit = max 0 (cfgMaxActiveSlots cfg - playerActiveSlotPenalty p)
        in if length (invActives inv) < limit
           then (p { playerInventory = inv { invActives = invActives inv ++ [it] } }, g)
           else (p, g)
    RewardPassiveItem it ->
        (p { playerInventory = (playerInventory p)
              { invPassives = Map.insertWith (+) it 1 (invPassives (playerInventory p)) } }, g)
    RewardEarthScore n ->
        (p { playerStorage = addResources (playerStorage p) (Map.singleton Spinel n) }, g)
    RewardAP n -> (p { playerAP = min (cfgApMax cfg) (playerAP p + n) }, g)
    RewardCombo rs -> foldl (\(p', g') r' -> applyReward cfg r' p' g') (p, g) (flattenReward r)

-- | Check tat ca objective cua player, danh dau completed neu thoa dieu kien.
-- Goi sau MOI action trong 'Game.Turn.applyAction'.
-- Khong tu claim reward — player phai goi action 'ClaimObjective'.
checkObjectives :: Config -> PlayerId -> Action -> GameState -> GameState
checkObjectives cfg pid action gs =
    let p = getPlayer pid gs
        tr = playerTrackers p
        currentScore = playerScore cfg p
        objs' = map (\o -> if not (objCompleted o)
                              && isObjectiveDone cfg action o tr currentScore (playerPos p) gs
                           then o { objCompleted = True } else o)
                    (playerObjectives p)
        p' = p { playerObjectives = objs' }
    in setPlayer pid p' gs

-- | Kiem tra 1 objective cu the da hoan thanh chua.
-- Tham so 'action' dung cho ObjDoNothing / ObjEndInRadiation (chi complete khi EndTurn).
-- Tham so 'gs' dung de check zone (ObjEndInRadiation).
isObjectiveDone :: Config -> Action -> Objective -> ObjectiveTrackers -> Int -> Pos -> GameState -> Bool
isObjectiveDone _cfg action obj tr currentScore currentPos gs = case objType obj of
    ObjMineTimes n       -> otMinesThisTurn tr >= n
    ObjMoveCells n       -> otCellsMoved tr >= n
    ObjScanTimes n       -> otScansThisTurn tr >= n
    ObjOpenCrates n      -> otCratesOpenedThisTurn tr >= n
    ObjUseWormholes n    -> otWormholesUsedThisTurn tr >= n
    ObjDepositTimes n    -> otDepositsThisTurn tr >= n
    ObjCraftItems n      -> otCraftsThisTurn tr >= n
    ObjUseItems n        -> otItemsUsedThisTurn tr >= n
    ObjMineResources n   -> otResourcesMinedThisTurn tr >= n
    ObjDoNothing         -> action == EndTurn
                            && not (otDidMove tr) && not (otDidScan tr)
                            && not (otDidMine tr) && not (otDidCraft tr)
                            && not (otDidUseItem tr) && not (otDidDeposit tr)
    ObjVisitPlanets n    -> length (otUniquePlanetsVisited tr) >= n
    ObjSpendBattery n    -> otBatterySpentThisTurn tr >= n
    ObjGainEarthScore n  -> currentScore - otEarthScoreAtStart tr >= n
    ObjVisitPlanetTypes n -> length (otUniquePlanetTypes tr) >= n
    ObjReachCell target  -> currentPos == target
    ObjDoAllFour         -> otDidMove tr && otDidScan tr && otDidMine tr && otDidCraft tr
    ObjCraftDifferent n  -> length (unique (otCraftedItems tr)) >= n
    ObjEndInRadiation    -> action == EndTurn && inZoneOfType ZoneRadiation gs currentPos
    ObjSquareDance       -> isSquare (otMoveSequence tr)
  where
    unique = foldr (\x acc -> if x `elem` acc then acc else x : acc) []
    isSquare seq = any isSq (windows 4 seq)
    isSq [DirRight, DirDown, DirLeft, DirUp] = True
    isSq [DirDown, DirLeft, DirUp, DirRight] = True
    isSq [DirLeft, DirUp, DirRight, DirDown] = True
    isSq [DirUp, DirRight, DirDown, DirLeft] = True
    isSq _ = False
    windows n xs = if length xs < n then [] else take n xs : windows n (drop 1 xs)



-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 5: MONOLITH & BEACON
-- ═══════════════════════════════════════════════════════════════════════════

doInteractMonolith :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doInteractMonolith cfg pid gs = do
    let player = getPlayer pid gs
    mon <- maybe (Left NotOnMonolith) Right (find ((== playerPos player) . monolithPos) (Map.elems (gsMonoliths gs)))
    when (playerBattery player < cfgMonolithBatteryCost cfg) (Left NotEnoughBattery)
    
    -- Tru pin
    let p0 = player { playerBattery = playerBattery player - cfgMonolithBatteryCost cfg }
        (roll, g1) = randomR (1, 100 :: Int) (gsRng gs)
        gs1 = gs { gsRng = g1, gsMonoliths = Map.delete (monolithId mon) (gsMonoliths gs) } -- Bia da bien mat
        
        -- 40% Tot, 60% Xau
        (p1, resultMsg, gFinal) = if roll <= 40
            then
                let (rewardRoll, g2) = randomR (1, 100 :: Int) g1
                in if rewardRoll <= 50 
                   then 
                        let (augs, g3) = generateAugments g2
                            selected = head augs -- Lay augment dau tien
                            p' = p0 { playerAugments = selected : playerAugments p0 }
                        in (p', "Nhan 1 Augment: " ++ show (augType selected) ++ " (" ++ show (augRarity selected) ++ ")", g3)
                   else if rewardRoll <= 80
                   then
                        let p' = p0 { playerCargo = Map.insertWith (+) PinkDiamond 1 (playerCargo p0) }
                        in (p', "Nhan 1 Kim Cuong Hong (Pink Diamond).", g2)
                   else
                        let p' = p0 { playerCargo = Map.insertWith (+) Topaz 5 (playerCargo p0) }
                        in (p', "Nhan 5 Quang hiem (Topaz).", g2)
            else
                let (punishRoll, g2) = randomR (1, 100 :: Int) g1
                in if punishRoll <= 33
                   then
                        let p' = p0 { playerBattery = max 0 (playerBattery p0 - 20) }
                        in (p', "Bi nguyen rua: Mat them 20 Pin.", g2)
                   else if punishRoll <= 66
                   then
                        case invActives (playerInventory p0) of
                            [] -> (p0, "Bi nguyen rua: Mat 1 vat pham chu dong (Tui do trong).", g2)
                            (item:_) -> 
                                let p' = p0 { playerInventory = (playerInventory p0) { invActives = removeFirst item (invActives (playerInventory p0)) } }
                                in (p', "Bi nguyen rua: Mat 1 vat pham chu dong.", g2)
                   else
                        let p' = p0 { playerPos = gsEarth gs }
                        in (p', "Bi nguyen rua: Bi dich chuyen ve Trai Dat.", g2)
                        
        finalGs = setPlayer pid p1 (gs1 { gsRng = gFinal })
    Right (finalGs, report (MonolithResult resultMsg))

doActivateBeacon :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doActivateBeacon cfg pid gs = do
    let player = getPlayer pid gs
    bea <- maybe (Left NotOnBeacon) Right (find ((== playerPos player) . beaconPos) (Map.elems (gsBeacons gs)))
    when (beaconActive bea) (Left BeaconAlreadyActivated)
    
    paid <- payCost (Cost 1 0) player
    let radius = cfgBeaconRadius cfg
        reveal pl = withinRadius radius (beaconPos bea) (planetPos pl)
        revealWh wh = withinRadius radius (beaconPos bea) (wormholePos wh)
        
        -- Cập nhật known planets
        newKnownPlanets p = foldr (\pl m -> Map.insert (planetId pl) (toKnown pl) m) (playerKnown p) (filter reveal (Map.elems (gsPlanets gs)))
        
        -- Cập nhật known wormholes
        newKnownWh p = foldr (\wh m -> Map.insert (wormholeId wh) wh m) (playerKnownWormholes p) (filter revealWh (Map.elems (gsWormholes gs)))
        
        p1 = paid { playerKnown = newKnownPlanets paid, playerKnownWormholes = newKnownWh paid }
        p2 = let p2' = getPlayer (otherPlayer pid) gs in p2' { playerKnown = newKnownPlanets p2', playerKnownWormholes = newKnownWh p2' }
        
        newBea = bea { beaconActive = True }
        gs1 = setPlayer (otherPlayer pid) p2 (setPlayer pid p1 (gs { gsBeacons = Map.insert (beaconId bea) newBea (gsBeacons gs) }))
    Right (gs1, report (BeaconActivated (beaconPos bea)))

