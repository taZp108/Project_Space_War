-- | Luot choi: ap dung action cua mot nguoi, doi luot, kiem tra thang/thua.
module Game.Turn
    ( applyAction
    , endTurn
    , forfeit
    , startTurn
    ) where
    
import Game.Action (performAction, removeFirst, checkObjectives, inZoneOfType)
import Game.Config
import Game.Generate (pickDistinct, generateCrates, generateZones, generateObjectives, generateAugments)
import Game.State
import Game.Types
import Game.World (allCells)
import qualified Data.Map.Strict as Map
import Data.List (sortOn)
import System.Random (randomR)

-- | Ap dung mot action cua nguoi choi. Kiem tra tran dang choi va dung luot,
-- roi thuc hien action, roi xu ly ket qua (thang, thua, het AP thi doi luot).
applyAction
    :: Config -> PlayerId -> Action -> GameState
    -> Either GameError (GameState, ActionReport)
applyAction cfg pid action gs
    | gsPhase gs /= InProgress = Left GameNotInProgress
    | gsCurrent gs /= pid      = Left NotYourTurn
    | otherwise = do
        (gs', rep) <- performAction cfg pid action gs
        let gsChecked = checkObjectives cfg pid action gs'
            gsAfter = afterAction cfg pid action gsChecked rep
            startedRound = gsPhase gsAfter == InProgress && gsRound gsAfter > gsRound gs
            (gsFinal, event) = if startedRound then triggerCanon cfg gsAfter else (gsAfter, Nothing)
            repFinal = maybe rep (\ev -> rep { reportResult = CanonEventOccurred ev (reportResult rep) }) event
        Right (gsFinal, repFinal)

-- | Sau moi action thanh cong, thu tu kiem tra la: thang (sau Deposit),
-- thua do het battery, roi het AP hoac EndTurn thi doi luot.
afterAction :: Config -> PlayerId -> Action -> GameState -> ActionReport -> GameState
afterAction cfg pid action gs rep
    | playerScore cfg me >= cfgScoreTarget cfg =
        finish (Winner pid ReachedTarget) gs
    | playerBattery me <= 0 =
        finish (Winner (otherPlayer pid) OpponentOutOfBattery) gs
    | action == EndTurn || forcedEnd (reportResult rep) || playerAP me <= 0 =
        -- Neu action KHONG phai EndTurn nhung bi auto/forced end,
        -- re-check objectives voi tin hieu EndTurn (cho ObjDoNothing / ObjEndInRadiation).
        let gsChecked = if action == EndTurn then gs
                        else checkObjectives cfg pid EndTurn gs
        in endTurn cfg gsChecked
    | otherwise = gs
  where
    me = getPlayer pid gs
    forcedEnd (PlanetEventOccurred _ nested forced) = forced || forcedEnd nested
    forcedEnd _ = False

-- | Ket thuc luot hien tai. Sau luot cua Player2 thi sang vong moi, neu da het
-- so vong thi tinh ket qua theo diem kho Earth. Nguoi den luot duoc nap day AP.
endTurn :: Config -> GameState -> GameState
endTurn cfg gs = case gsCurrent gs of
    Player1 ->
        startTurn cfg Player2 (applyRadiationDrain cfg Player1 gs)
    Player2
        | gsRound gs >= cfgMaxRounds cfg -> finish (roundLimitResult cfg gs) gs
        | (gsRound gs + 1) `mod` cfgAugmentInterval cfg == 1 ->
            let gsRad = applyRadiationDrain cfg Player2 gs
                gsNew = beginNewRound cfg (gsRound gs + 1) gsRad
                (augs, g') = generateAugments (gsRng gsNew)
            in gsNew { gsPendingAugments = Just augs
                     , gsAugmentChoices = Map.empty
                     , gsRng = g'
                     }
        | otherwise ->
            startTurn cfg Player1
                (beginNewRound cfg (gsRound gs + 1)
                    (applyRadiationDrain cfg Player2 gs))

-- | Tru battery cuoi luot neu player dang dung trong vung Radiation.
-- Chi goi tu 'endTurn', khong goi truc tiep tu cho khac.
applyRadiationDrain :: Config -> PlayerId -> GameState -> GameState
applyRadiationDrain cfg pid gs =
    let p = getPlayer pid gs
    in if inZoneOfType ZoneRadiation gs (playerPos p)
       then setPlayer pid (p { playerBattery = max 0 (playerBattery p - cfgRadiationBatteryDrain cfg) }) gs
       else gs

-- | Sang vong moi: cap nhat gsRound, loc crate het han, roll crate moi,
-- reset zones, reset objectives cho ca 2 player.
beginNewRound :: Config -> Int -> GameState -> GameState
beginNewRound cfg newRound gs =
    let -- Loc crate con han
        cratesFiltered = Map.filter (\c -> newRound - crateSpawnedRound c <= cfgCrateLifetime cfg) (gsCrates gs)
        -- Roll crate moi cho vong nay
        (newCrates, nextCrateId, g1) = generateCrates cfg gs newRound
        cratesAll = Map.union cratesFiltered newCrates
        -- Reset zones
        (zones, g2) = generateZones cfg (gsPlanets gs) (gsWormholes gs) g1
        -- Reset objectives
        (objs1, g3) = generateObjectives cfg (playerPos (gsPlayer1 gs)) (gsNextObjId gs) g2
        (objs2, g4) = generateObjectives cfg (playerPos (gsPlayer2 gs)) (gsNextObjId gs + 50) g3
        p1 = (gsPlayer1 gs) { playerObjectives = objs1 }
        p2 = (gsPlayer2 gs) { playerObjectives = objs2 }
    in gs { gsRound = newRound
          , gsZones = zones
          , gsCrates = cratesAll
          , gsNextCrateId = nextCrateId
          , gsNextZoneId = Map.size zones + 1
          , gsNextObjId = gsNextObjId gs + 100
          , gsPlayer1 = p1
          , gsPlayer2 = p2
          , gsRng = g4
          }


-- | Bat dau luot cua mot nguoi: dat nguoi do lam nguoi hien tai, AP day,
-- reset tracker (cho objective tinh theo luot), va decay cargo penalty neu co.
startTurn :: Config -> PlayerId -> GameState -> GameState
startTurn cfg pid gs =
    modifyPlayer pid (\p ->
        let penalty = playerCargoPenaltyTurns p
            newPenalty = max 0 (penalty - 1)
            newJam = if penalty > 0 && newPenalty == 0
                     then max 0 (playerCargoJam p - 5)  -- giai phong 5 jam khi het han
                     else playerCargoJam p
        in p { playerAP = max 0 (playerMaxAP cfg p - playerNextTurnAPPenalty p)
             , playerNextTurnAPPenalty = 0
             , playerTrackers = emptyTrackers { otEarthScoreAtStart = playerScore cfg p }
             , playerCargoPenaltyTurns = newPenalty
             , playerCargoJam = newJam
             }
        ) (gs { gsCurrent = pid })

-- | Ket qua khi het so vong: diem Earth cao hon thang, bang nhau thi hoa.
roundLimitResult :: Config -> GameState -> GameResult
roundLimitResult cfg gs =
    case compare (playerScore cfg (gsPlayer1 gs)) (playerScore cfg (gsPlayer2 gs)) of
        GT -> Winner Player1 HigherScoreAtLimit
        LT -> Winner Player2 HigherScoreAtLimit
        EQ -> Draw

-- | Nguoi choi mat ket noi thi doi thu thang. Tran da ket thuc thi giu nguyen.
forfeit :: PlayerId -> GameState -> GameState
forfeit loser gs = case gsPhase gs of
    Finished _ -> gs
    _          -> finish (Winner (otherPlayer loser) OpponentDisconnected) gs

finish :: GameResult -> GameState -> GameState
finish result gs = gs { gsPhase = Finished result }

triggerCanon :: Config -> GameState -> (GameState, Maybe CanonEvent)
triggerCanon cfg gs =
    let (roll, g1) = randomR (1, 100 :: Int) (gsRng gs)
        (ix, g2) = randomR (fromEnum (minBound :: CanonEvent), fromEnum (maxBound :: CanonEvent)) g1
        cleared = gs { gsRng = g2, gsActiveCanonEvent = Nothing }
    in if roll > cfgCanonEventChance cfg then (cleared, Nothing)
       else let ev = toEnum ix in (applyCanon cfg ev cleared, Just ev)

applyCanon :: Config -> CanonEvent -> GameState -> GameState
applyCanon cfg ev gs = case ev of
    CE_BlackHole -> gs { gsPlayer1 = (gsPlayer1 gs) { playerPos = p1 }, gsPlayer2 = (gsPlayer2 gs) { playerPos = p2 }, gsRng = blackHoleRng }
    CE_Tax -> gs { gsPlayer1 = tax (gsPlayer1 gs), gsPlayer2 = tax (gsPlayer2 gs) }
    CE_ReverseGravity -> gs { gsActiveCanonEvent = Just CE_ReverseGravity }
    CE_GalacticFair -> let (a, g1) = fair (gsPlayer1 gs) (gsRng gs)
                           (b, g2) = fair (gsPlayer2 gs) g1
                       in gs { gsPlayer1 = a, gsPlayer2 = b, gsRng = g2 }
    CE_SolarStorm -> gs { gsPlayer1 = storm (gsPlayer1 gs), gsPlayer2 = storm (gsPlayer2 gs) }
    CE_TwinPlanet -> case Map.elems (gsPlanets gs) of
        [] -> gs
        planets -> let (i, g) = randomR (0, length planets - 1) (gsRng gs)
                       source = planets !! i
                       newId = 1 + maximum (0 : Map.keys (gsPlanets gs))
                       clone = source { planetId = newId, planetEventTriggered = True }
                   in gs { gsPlanets = Map.insert newId clone (gsPlanets gs), gsRng = g }
    CE_Homecoming ->
        gs { gsPlayer1 = (gsPlayer1 gs) { playerPos = gsEarth gs }
           , gsPlayer2 = (gsPlayer2 gs) { playerPos = gsEarth gs } }
    CE_GiftItem ->
        let items = [minBound .. maxBound] :: [ItemId]
            (ix, g') = randomR (0, length items - 1) (gsRng gs)
            item = items !! ix
            give p = case itemType item of
                Passive -> p { playerInventory = (playerInventory p)
                                { invPassives = Map.insertWith (+) item 1 (invPassives (playerInventory p)) } }
                Active -> let slots = max 0 (cfgMaxActiveSlots cfg - playerActiveSlotPenalty p)
                              inv = playerInventory p
                          in if length (invActives inv) < slots
                             then p { playerInventory = inv { invActives = invActives inv ++ [item] } }
                             else p
        in gs { gsPlayer1 = give (gsPlayer1 gs), gsPlayer2 = give (gsPlayer2 gs), gsRng = g' }
    CE_TheftItem ->
        let (p1', g1) = case invActives (playerInventory (gsPlayer1 gs)) of
                [] -> (gsPlayer1 gs, gsRng gs)
                xs -> let (i, g') = randomR (0, length xs - 1) (gsRng gs)
                          stolen = xs !! i
                      in ((gsPlayer1 gs) { playerInventory = (playerInventory (gsPlayer1 gs)) { invActives = removeFirst stolen xs } }, g')
            (p2', g2) = case invActives (playerInventory (gsPlayer2 gs)) of
                [] -> (gsPlayer2 gs, g1)
                xs -> let (i, g') = randomR (0, length xs - 1) g1
                          stolen = xs !! i
                      in ((gsPlayer2 gs) { playerInventory = (playerInventory (gsPlayer2 gs)) { invActives = removeFirst stolen xs } }, g')
        in gs { gsPlayer1 = p1', gsPlayer2 = p2', gsRng = g2 }
    CE_SupplyDrop ->
        let resources = [minBound .. maxBound] :: [ResourceType]
            (ix, g1) = randomR (0, length resources - 1) (gsRng gs)
            resource = resources !! ix
            (amt1, g2) = randomR (3, 5 :: Int) g1
            (amt2, g3) = randomR (3, 5 :: Int) g2
            give p amt = let room = max 0 (playerMaxCargo cfg p - totalUnits (playerCargo p))
                             take' = min room amt
                         in p { playerCargo = Map.insertWith (+) resource take' (playerCargo p) }
        in gs { gsPlayer1 = give (gsPlayer1 gs) amt1, gsPlayer2 = give (gsPlayer2 gs) amt2, gsRng = g3 }
    CE_Plunder ->
        let resources = [minBound .. maxBound] :: [ResourceType]
            (ix, g1) = randomR (0, length resources - 1) (gsRng gs)
            resource = resources !! ix
            (amt, g2) = randomR (2, 5 :: Int) g1
            plunder p = let current = Map.findWithDefault 0 resource (playerCargo p)
                            lost = min amt current
                            updated = Map.update (\n -> if n <= lost then Nothing else Just (n - lost)) resource (playerCargo p)
                        in p { playerCargo = updated }
        in gs { gsPlayer1 = plunder (gsPlayer1 gs), gsPlayer2 = plunder (gsPlayer2 gs), gsRng = g2 }
  where
    safeCells = filter (/= gsEarth gs) (allCells cfg)
    (spots, blackHoleRng) = pickDistinct 2 safeCells (gsRng gs)
    p1 = case spots of x:_ -> x; [] -> playerPos (gsPlayer1 gs)
    p2 = case spots of _:y:_ -> y; _ -> playerPos (gsPlayer2 gs)
    tax p =
        let target = playerScore cfg p `div` 10
            (remainder, pointsRemoved) = removeScore target (playerStorage p) 0
            room = max 0 (playerMaxCargo cfg p - totalUnits (playerCargo p))
            dropped = Map.singleton Spinel (min room pointsRemoved)
        in p { playerStorage = remainder, playerCargo = Map.unionWith (+) (playerCargo p) dropped }
    removeScore remaining storage points
        | remaining <= 0 = (storage, points)
        | otherwise = case sortOn (negate . value . fst) [(r,n) | (r,n) <- Map.toList storage, n > 0, value r <= remaining] of
            (resource,_):_ -> takeUnit resource (value resource)
            [] -> case sortOn (value . fst) [(r,n) | (r,n) <- Map.toList storage, n > 0] of
                (resource,_):_ -> takeUnit resource (value resource)
                [] -> (storage, points)
      where
        value resource = Map.findWithDefault 0 resource (cfgResourceValue cfg)
        takeUnit resource unitValue =
            let next = Map.update (\n -> if n <= 1 then Nothing else Just (n - 1)) resource storage
            in removeScore (remaining - unitValue) next (points + unitValue)
    storm p = let low = playerBattery p < 30
              in p { playerBattery = max 0 (playerBattery p - 30)
                   , playerNextTurnAPPenalty = playerNextTurnAPPenalty p + if low then 1 else 0 }
    fair p gen =
        let cargo = playerCargo p
            (keys, g1) = pickDistinct (min 5 (totalUnits cargo)) (concatMap (\(r,n) -> replicate n r) (Map.toList cargo)) gen
            lost = Map.fromListWith (+) [(r,1) | r <- keys]
            cargo' = maybe cargo id (removeResources cargo lost)
            inv = playerInventory p
            activeItems = [IT_Teleport, IT_Battery, IT_AP, IT_BlackHole, IT_SwapPos, IT_Scarecrow, IT_Steal, IT_APBoost, IT_Magnet]
            (ix,g2) = randomR (0,length activeItems - 1) g1
            slots = max 0 (cfgMaxActiveSlots cfg - playerActiveSlotPenalty p)
            inv' = if length (invActives inv) < slots then inv { invActives = invActives inv ++ [activeItems !! ix] } else inv
        in (p { playerCargo = cargo', playerInventory = inv' }, g2)

