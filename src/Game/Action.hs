-- | Luat cua tung action: kiem tra dieu kien, tru chi phi, cap nhat trang thai.
--
-- Module nay khong lo chuyen luot hay kiem tra thang/thua (viec cua "Game.Turn").
module Game.Action
    ( performAction
    , removeFirst
    ) where

import Control.Monad (unless, when)
import Data.List (sortOn, maximumBy)
import Data.Ord (comparing)
import Data.Maybe (fromMaybe)
import qualified Data.Map.Strict as Map
import System.Random (StdGen, randomR)

import Game.Config
import Game.Generate (pickDistinct)
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
        }

toKnown :: Planet -> KnownPlanet
toKnown pl = KnownPlanet (planetPos pl) (planetType pl) Nothing Nothing



-- | Them mot hanh tinh vao danh sach da kham pha.
learn :: Planet -> Player -> Player
learn pl p = p { playerKnown = Map.insert (planetId pl) (toKnown pl) (playerKnown p) }

-- | Neu dang dung tren mot hanh tinh thi tu kham pha no.
discoverHere :: GameState -> Player -> Player
discoverHere gs p = maybe p (`learn` p) (planetAt (playerPos p) gs)

doMove :: Config -> PlayerId -> Direction -> GameState -> Either GameError (GameState, ActionReport)
doMove cfg pid dir gs = do
    let player = getPlayer pid gs
        target = movePos dir (playerPos player)
    doMoveTo cfg pid target gs

doMoveTo :: Config -> PlayerId -> Pos -> GameState -> Either GameError (GameState, ActionReport)
doMoveTo cfg pid target gs = do
    let player = getPlayer pid gs
        steps = distance (playerPos player) target
        Cost ap battery = playerMoveCost cfg player
        eventMultiplier = if gsActiveCanonEvent gs == Just CE_ReverseGravity then 2 else 1
        cost = Cost (ap * steps) (max 0 (battery * steps * eventMultiplier))
    unless (inBounds cfg target) (Left OutOfBounds)
    paid <- payCost cost player
    let moved = discoverHere gs (paid { playerPos = target })
    Right (setPlayer pid moved gs, report (Moved target))

-- | Dung chung cho Observe va ScanArea, chi khac ban kinh va chi phi.
doScanArea :: Cost -> Int -> Bool -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doScanArea cost radius revealDetails pid gs = do
    let player = getPlayer pid gs
        visible =
            [ pl
            | pl <- Map.elems (gsPlanets gs)
            , withinRadius radius (playerPos player) (planetPos pl)
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
        resultPlanets = map (\pl -> maybe (toKnown pl) id (Map.lookup (planetId pl) (playerKnown learned))) visible
    Right (setPlayer pid learned gs, report (PlanetsFound resultPlanets))

doScanNearest :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doScanNearest cfg pid gs = do
    let player = getPlayer pid gs
        here = playerPos player
        candidates = [ pl | pl <- Map.elems (gsPlanets gs), totalUnits (planetStock pl) > 0 ]
        nearest = case sortOn (\pl -> (distance here (planetPos pl), planetId pl)) candidates of
            []       -> Nothing
            (pl : _) -> Just (compassFrom here (planetPos pl), distance here (planetPos pl))
    paid <- payCost (cfgCostScanNearest cfg) player
    Right (setPlayer pid paid gs, report (NearestPlanet nearest))

doScanOpponent :: Config -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doScanOpponent cfg pid gs = do
    let player = getPlayer pid gs
        opponent = getPlayer (otherPlayer pid) gs
        direction = compassFrom (playerPos player) (playerPos opponent)
    paid <- payCost (cfgCostScanOpponent cfg) player
    Right ( setPlayer pid paid gs
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
    let amount = minimum [cfgMineAmount cfg, stock, free]
        newStock = Map.filter (> 0) (Map.insert res (stock - amount) (planetStock planet))
        planet' = planet { planetStock = newStock }
        cargo' = Map.insertWith (+) res amount (playerCargo paid)
        player' = learn planet' (paid { playerCargo = cargo' })
        gs' = setPlayer pid player' (gs { gsPlanets = Map.insert (planetId planet) planet' (gsPlanets gs) })
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
        planet' = planet { planetStock = stock' }
        midasChance = case [ augRarity o | o <- playerAugments player, augType o == Aug_Midas ] of
                        (r:_) -> case r of Silver -> 20; Gold -> 50; Diamond -> 100
                        [] -> 0
        (midasRoll, _g4) = randomR (1, 100 :: Int) g1
        midasMap = if midasRoll <= midasChance then Map.singleton PinkDiamond 1 else Map.empty
        finalMinedMap = Map.unionWith (+) minedMap midasMap
        cargo' = Map.unionWith (+) (playerCargo paid) finalMinedMap
        minedPlayer = learn planet' (paid { playerCargo = cargo' })

        (eventRoll, g2) = randomR (1, 100 :: Int) g1
        trigger = not (planetEventTriggered planet) && eventRoll <= 15
        planet'' = planet' { planetEventTriggered = planetEventTriggered planet || trigger }
        
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
    Right (setPlayer pid p' gs, report (ItemCrafted item))

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
    Right (final, report (ItemUsed item))

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
            }
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
