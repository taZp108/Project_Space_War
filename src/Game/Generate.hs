-- | Sinh map, hanh tinh va vi tri xuat phat tu mot seed ngau nhien.
module Game.Generate
    ( newGame
    , generatePlanets
    , pickDistinct
    , generateWormholes
    , generateZones
    , generateCrates
    , generateObjectives
    , generateAugments
    , pickWeightedResource
    ) where

import qualified Data.Map.Strict as Map
import System.Random (StdGen, mkStdGen, randomR)

import Game.Config
import Game.Types
import Game.World

-- | Tao mot tran moi (da du hai nguoi, Player1 di truoc, vong 1).
-- Cung cau hinh va cung seed luon ra cung ket qua.
newGame :: Config -> Int -> GameState
newGame cfg seed = gsFinal
  where
    earth = earthPosition cfg
    (planets, g1) = generatePlanets cfg (mkStdGen seed)
    spawnCells = ringCells cfg earth (cfgSpawnMinDist cfg) (cfgSpawnMaxDist cfg)
    (spawn1, g2) = pickOne earth spawnCells g1
    (spawn2, g3) = pickOne earth spawnCells g2
    (whs, g4)    = generateWormholes cfg planets g3
    (zones, g5)  = generateZones cfg planets whs g4
    (objs1, g6)  = generateObjectives cfg spawn1 0 g5
    (objs2, g7)  = generateObjectives cfg spawn2 100 g6
    p1 = (newPlayer cfg spawn1) { playerObjectives = objs1 }
    p2 = (newPlayer cfg spawn2) { playerObjectives = objs2 }
    gs0 = GameState
        { gsMapWidth  = cfgMapWidth cfg
        , gsMapHeight = cfgMapHeight cfg
        , gsEarth     = earth
        , gsPlanets   = planets
        , gsPlayer1   = p1
        , gsPlayer2   = p2
        , gsCurrent   = Player1
        , gsRound     = 1
        , gsPhase     = InProgress
        , gsRng       = g7
        , gsActiveCanonEvent = Nothing
        , gsPendingAugments = Nothing
        , gsAugmentChoices = Map.empty
        , gsWormholes     = whs
        , gsZones         = zones
        , gsCrates        = Map.empty
        , gsNextCrateId   = 1
        , gsNextZoneId    = 1 + maximum (0 : Map.keys zones)
        , gsNextObjId     = 1 + maximum (0 : map objId (objs1 ++ objs2))
        }
    (crates, nextCrateId, g8) = generateCrates cfg gs0 1
    (firstAugs, g9) = generateAugments g8
    gsFinal = gs0 { gsCrates = crates
                  , gsNextCrateId = nextCrateId
                  , gsPendingAugments = Just firstAugs
                  , gsAugmentChoices = Map.empty
                  , gsRng = g9
                  }

-- | Nguoi choi moi: day battery, day AP, kho trong, chua kham pha gi.
newPlayer :: Config -> Pos -> Player
newPlayer cfg pos = Player
    { playerPos     = pos
    , playerBattery = cfgBatteryMax cfg
    , playerAP      = cfgApMax cfg
    , playerCargo   = Map.empty
    , playerStorage = Map.empty
    , playerKnown   = Map.empty
    , playerInventory = Inventory Map.empty []
    , playerLuck = 0
    , playerActiveSlotPenalty = 0
    , playerNextTurnAPPenalty = 0
    , playerCargoJam         = 0
    , playerTotalDeposited   = Map.empty
    , playerAugments = []
    , playerKnownWormholes = Map.empty
    , playerObjectives     = []
    , playerTrackers       = emptyTrackers
    , playerCargoPenaltyTurns = 0
    }

-- | Sinh cac hanh tinh: dung so luong tung loai, o khac nhau,
-- khong nam gan Earth hon 'cfgPlanetMinEarthDist'.
generatePlanets :: Config -> StdGen -> (Map.Map PlanetId Planet, StdGen)
generatePlanets cfg g0 = (Map.fromList [ (planetId p, p) | p <- finalPlanets ], g3)
  where
    earth = earthPosition cfg
    typeList = concat [ replicate n t | (t, n) <- Map.toList (cfgPlanetCounts cfg) ]
    candidates = [ p | p <- allCells cfg, distance p earth >= cfgPlanetMinEarthDist cfg ]
    (shuffledTypes, g1) = pickDistinct (length typeList) typeList g0
    (cells, g2) = pickDistinct (length typeList) candidates g1

    rawPlanets =
        [ Planet i c t (Map.findWithDefault Map.empty t (cfgPlanetStock cfg)) False Nothing
        | (i, c, t) <- zip3 [1 ..] cells shuffledTypes
        ]

    (finalPlanets, g3) = assignEvents rawPlanets g2

-- | Boc ngau nhien @k@ phan tu khac nhau (khong lap) tu danh sach.
pickDistinct :: Int -> [a] -> StdGen -> ([a], StdGen)
pickDistinct k xs g
    | k <= 0 || null xs = ([], g)
    | otherwise =
        let (i, g') = randomR (0, length xs - 1) g
        in case splitAt i xs of
            (before, chosen : after) ->
                let (rest, g'') = pickDistinct (k - 1) (before ++ after) g'
                in (chosen : rest, g'')
            (_, []) -> ([], g')

-- | Boc ngau nhien mot phan tu; danh sach rong thi tra ve gia tri mac dinh.
pickOne :: a -> [a] -> StdGen -> (a, StdGen)
pickOne def xs g = case pickDistinct 1 xs g of
    (x : _, g') -> (x, g')
    ([], g')    -> (def, g')

-- | Gan ngau nhien mot PlanetEvent cho moi hanh tinh.
assignEvents :: [Planet] -> StdGen -> ([Planet], StdGen)
assignEvents [] g = ([], g)
assignEvents (p:ps) g =
    let (evIdx, g1) = randomR (0, fromEnum (maxBound :: PlanetEvent)) g
        ev = toEnum evIdx
        p' = p { planetEventType = Just ev }
        (rest, g2) = assignEvents ps g1
    in (p' : rest, g2)

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1: WORMHOLES
-- ═══════════════════════════════════════════════════════════════════════════

-- | Sinh cfgWormholePairCount cap wormhole. Moi cap cach nhau >= cfgWormholeMinDistance.
-- Moi cong cach Earth >= cfgWormholeEarthDist, khong de len hanh tinh.
generateWormholes :: Config -> Map.Map PlanetId Planet -> StdGen -> (Map.Map WormholeId Wormhole, StdGen)
generateWormholes cfg planets g0 = go [] (cfgWormholePairCount cfg) Map.empty 1 g0
  where
    earth = earthPosition cfg
    planetCells = map planetPos (Map.elems planets)
    allValid = [ p
               | p <- allCells cfg
               , distance p earth >= cfgWormholeEarthDist cfg
               , p `notElem` planetCells
               ]
    go _ 0 acc _ g = (acc, g)
    go existing n acc wid g
      | null candidates1 = (acc, g)
      | otherwise =
          case candidates2 of
              [] -> go existing (n - 1) acc wid g2
              _ ->
                  let (i2, g3) = randomR (0, length candidates2 - 1) g2
                      p2 = candidates2 !! i2
                      wh1 = Wormhole wid p1 (wid + 1)
                      wh2 = Wormhole (wid + 1) p2 wid
                      acc' = Map.insert wid wh1 (Map.insert (wid + 1) wh2 acc)
                  in go (p1 : p2 : existing) (n - 1) acc' (wid + 2) g3
      where
        candidates1 = filter (`notElem` existing) allValid
        (i1, g2) = randomR (0, max 0 (length candidates1 - 1)) g
        p1 = if null candidates1 then Pos 0 0 else candidates1 !! i1
        candidates2 = filter (\p -> p `notElem` existing && p /= p1
                                 && distance p p1 >= cfgWormholeMinDistance cfg) candidates1

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2: ZONES
-- ═══════════════════════════════════════════════════════════════════════════

-- | Sinh 0-4 zone random loai. Vong nao cung goi (ke ca khong co zone).
generateZones :: Config -> Map.Map PlanetId Planet -> Map.Map WormholeId Wormhole -> StdGen -> (Map.Map ZoneId Zone, StdGen)
generateZones cfg _planets _whs g0 =
    let (skipRoll, g1) = randomR (1, 100 :: Int) g0
    in if skipRoll <= cfgZoneSkipChance cfg
       then (Map.empty, g1)
       else
         let (count, g2) = randomR (cfgZoneCountMin cfg, cfgZoneCountMax cfg) g1
             earth = earthPosition cfg
             (zs, g') = go count Map.empty 1 [] g2
             go 0 acc _ _ g = (acc, g)
             go n acc zid existingCenters g =
                 let (tyRoll, gA) = randomR (0, 4 :: Int) g
                     ty = toEnum tyRoll
                     (shape, gB) = randomShape ty gA
                     minEarthDist = zoneMinEarthDist shape
                     maxTries = 30 :: Int
                     (center, gC) = pickCenter maxTries minEarthDist earth existingCenters gB
                     zone = Zone zid ty shape center
                 in go (n - 1) (Map.insert zid zone acc) (zid + 1) (center : existingCenters) gC
             randomShape ty g = case ty of
                 ZoneJamming ->
                     let (r, gg) = randomR (cfgJammingRadiusMin cfg, cfgJammingRadiusMax cfg) g
                     in (ZoneCircle r, gg)
                 ZoneRadiation ->
                     let (r, gg) = randomR (cfgRadiationRadiusMin cfg, cfgRadiationRadiusMax cfg) g
                     in (ZoneCircle r, gg)
                 ZoneZeroG ->
                     let (w, gg1) = randomR (cfgZeroGWidthMin cfg, cfgZeroGWidthMax cfg) g
                         (h, gg2) = randomR (cfgZeroGHeightMin cfg, cfgZeroGHeightMax cfg) gg1
                     in (ZoneRect w h, gg2)
                 ZoneSwamp ->
                     let (r, gg) = randomR (cfgSwampRadiusMin cfg, cfgSwampRadiusMax cfg) g
                     in (ZoneCircle r, gg)
                 ZoneGoldRush ->
                     let (r, gg) = randomR (cfgGoldRadiusMin cfg, cfgGoldRadiusMax cfg) g
                     in (ZoneCircle r, gg)
             zoneMinEarthDist (ZoneCircle r) = r + 3
             zoneMinEarthDist (ZoneRect w h) = (max w h `div` 2) + 3
             pickCenter 0 _ _ _ gg = (Pos (cfgMapWidth cfg `div` 2) (cfgMapHeight cfg `div` 2), gg)
             pickCenter tries med earthCtr centers gg =
                 let (x, gg1) = randomR (0, cfgMapWidth cfg - 1) gg
                     (y, gg2) = randomR (0, cfgMapHeight cfg - 1) gg1
                     p = Pos x y
                 in if distance p earthCtr >= med && p `notElem` centers
                    then (p, gg2)
                    else pickCenter (tries - 1) med earthCtr centers gg2
         in (zs, g')

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 3: CRATES
-- ═══════════════════════════════════════════════════════════════════════════

-- | Roll crate cho round hien tai. Tra ve (crate moi, nextCrateId, rng).
generateCrates :: Config -> GameState -> Int -> (Map.Map CrateId Crate, Int, StdGen)
generateCrates cfg gs roundNo =
    let (roll, g1) = randomR (1, 100 :: Int) (gsRng gs)
    in if roll > cfgCrateSpawnChance cfg
       then (Map.empty, gsNextCrateId gs, g1)
       else
         let (nCrate, g2) = randomR (cfgCrateCountMin cfg, cfgCrateCountMax cfg) g1
             earth = gsEarth gs
             occupied = [ earth
                        , playerPos (gsPlayer1 gs)
                        , playerPos (gsPlayer2 gs)
                        ] ++ map wormholePos (Map.elems (gsWormholes gs))
             valid = [ p | p <- allCells cfg
                     , distance p earth >= cfgCrateMinEarthDist cfg
                     , p `notElem` occupied ]
             (crates, g3) = go nCrate (gsNextCrateId gs) Map.empty valid g2
             go 0 _ acc _ g = (acc, g)
             go k cid acc vs g
               | null vs = (acc, g)
               | otherwise =
                   let (i, gA) = randomR (0, length vs - 1) g
                       pos = vs !! i
                       (content, gB) = generateCrateContent cfg gA
                       crate = Crate cid pos content roundNo
                   in go (k - 1) (cid + 1) (Map.insert cid crate acc) (filter (/= pos) vs) gB
         in (crates, gsNextCrateId gs + nCrate, g3)

-- | Random crate la loot hay trap (theo cfgCrateTrapChance).
generateCrateContent :: Config -> StdGen -> (CrateContent, StdGen)
generateCrateContent cfg g0 =
    let (trapRoll, g1) = randomR (1, 100 :: Int) g0
    in if trapRoll <= cfgCrateTrapChance cfg
       then let (t, g2) = randomTrap g1 in (CrateTrap t, g2)
       else let (loot, g2) = generateLoot cfg g1 in (CrateLoot loot, g2)

-- | Sinh 3-6 loot items cho mot hom.
generateLoot :: Config -> StdGen -> ([LootItem], StdGen)
generateLoot cfg g0 =
    let (n, g1) = randomR (3, 6 :: Int) g0
        go 0 acc g = (acc, g)
        go k acc g =
            let (tierRoll, gA) = randomR (1, 100 :: Int) g
                (loot, gB) = if tierRoll <= 60 then commonLoot gA
                             else if tierRoll <= 85 then rareLoot gA
                             else supplyLoot gA
                (rest, g') = go (k - 1) acc gB
            in (loot : rest, g')
        commonLoot g =
            let (sub, g1') = randomR (0, 2 :: Int) g
            in case sub of
                0 -> let (r, g2') = pickWeightedResource cfg g1'
                         (nn, g3') = randomR (15, 30 :: Int) g2'
                     in (LootResources (Map.singleton r nn), g3')
                1 -> let items = [minBound .. maxBound] :: [ItemId]
                         (i, g2') = randomR (0, length items - 1) g1'
                     in (LootActiveItem (items !! i), g2')
                _ -> let items = [minBound .. maxBound] :: [ItemId]
                         (i, g2') = randomR (0, length items - 1) g1'
                     in (LootPassiveItem (items !! i), g2')
        rareLoot g =
            let (sub, g1') = randomR (0, 2 :: Int) g
            in case sub of
                0 -> let (n1, g2') = randomR (1, 2 :: Int) g1'
                         (n2, g3') = randomR (8, 15 :: Int) g2'
                     in (LootResources (Map.fromList [(PinkDiamond, n1), (Topaz, n2)]), g3')
                1 -> let rareItems = [IT_Teleport, IT_BlackHole, IT_Steal]
                         (i, g2') = randomR (0, length rareItems - 1) g1'
                     in (LootActiveItem (rareItems !! i), g2')
                _ -> (LootAugment Silver, g1')
        supplyLoot g =
            let (sub, g1') = randomR (0, 1 :: Int) g
            in case sub of
                0 -> let richItems = [IT_Teleport, IT_BlackHole, IT_Magnet, IT_Steal, IT_APBoost]
                         (i, g2') = randomR (0, length richItems - 1) g1'
                     in (LootActiveItem (richItems !! i), g2')
                _ -> (LootAugment Gold, g1')
    in go n [] g1

-- | Random trap type.
randomTrap :: StdGen -> (TrapType, StdGen)
randomTrap g0 =
    let (i, g1) = randomR (0, 14 :: Int) g0
        (n1, g2) = randomR (10, 30 :: Int) g1
    in case i of
        0  -> (TrapBatteryLeak n1, g2)
        1  -> (TrapMagneticStorm 30, g2)
        2  -> (TrapItemThief, g2)
        3  -> (TrapPassiveThief, g2)
        4  -> (TrapTax 15, g2)
        5  -> (TrapTeleportRandom 3 5, g2)
        6  -> (TrapCargoLeak 5 3, g2)
        7  -> (TrapPlunder 10, g2)
        8  -> (TrapAPDrain 1, g2)
        9  -> (TrapNextAPDrain 1, g2)
        10 -> (TrapEmptyCrate, g2)
        11 -> (TrapHomecoming, g2)
        12 -> (TrapRadiation 10 10, g2)
        13 -> (TrapMiniBlackHole 15, g2)
        _  -> (TrapMixed 10 1 10, g2)

-- | Chon resource theo trong so rarity (rarity cao = pho bien = xuat hien nhieu hon).
pickWeightedResource :: Config -> StdGen -> (ResourceType, StdGen)
pickWeightedResource cfg g0 =
    let rarities = Map.toList (cfgResourceRarity cfg)
        totalWeight = sum [ w | (_, r) <- rarities, let w = max 1 r ]
        (roll, g1) = randomR (0, max 0 (totalWeight - 1)) g0
        go _ [] g = (Spinel, g)
        go r ((res, rar):rest) g
          | r < w = (res, g)
          | otherwise = go (r - w) rest g
          where w = max 1 rar
    in go roll rarities g1

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 4: OBJECTIVES
-- ═══════════════════════════════════════════════════════════════════════════

-- | Sinh 3 nhiem vu (1 easy, 1 medium, 1 hard). objOffset tranh trung ID giua 2 player.
generateObjectives :: Config -> Pos -> Int -> StdGen -> ([Objective], StdGen)
generateObjectives cfg startPos offset g0 =
    let (easy, g1) = pickObj ObjEasy offset g0
        (med, g2)  = pickObj ObjMedium (offset + 10) g1
        (hard, g3) = pickObj ObjHard (offset + 20) g2
    in ([easy, med, hard], g3)
  where
    pickObj diff off g =
        let pool = objectivePoolFor diff
            (idx, g1') = randomR (0, length pool - 1) g
            (ty, g2')  = instantiate cfg startPos (pool !! idx) g1'
            (rew, g3') = pickReward diff g2'
            obj = Objective
                { objId = off
                , objDifficulty = diff
                , objType = ty
                , objReward = rew
                , objCompleted = False
                , objClaimed = False
                , objTargetPos = case ty of
                    ObjReachCell p -> Just p
                    _ -> Nothing
                }
        in (obj, g3')

    instantiate _ pos tmpl g = case tmpl of
        ObjMineTimes _ ->
            let (n, g') = randomR (2, 4 :: Int) g in (ObjMineTimes n, g')
        ObjMoveCells _ ->
            let (n, g') = randomR (5, 15 :: Int) g in (ObjMoveCells n, g')
        ObjScanTimes _ ->
            let (n, g') = randomR (1, 3 :: Int) g in (ObjScanTimes n, g')
        ObjOpenCrates _ -> (ObjOpenCrates 1, g)
        ObjUseWormholes _ ->
            let (n, g') = randomR (1, 2 :: Int) g in (ObjUseWormholes n, g')
        ObjDepositTimes _ -> (ObjDepositTimes 1, g)
        ObjCraftItems _ ->
            let (n, g') = randomR (1, 2 :: Int) g in (ObjCraftItems n, g')
        ObjUseItems _ -> (ObjUseItems 1, g)
        ObjMineResources _ ->
            let (n, g') = randomR (5, 15 :: Int) g in (ObjMineResources n, g')
        ObjDoNothing -> (ObjDoNothing, g)
        ObjVisitPlanets _ ->
            let (n, g') = randomR (2, 3 :: Int) g in (ObjVisitPlanets n, g')
        ObjSpendBattery _ ->
            let (n, g') = randomR (20, 30 :: Int) g in (ObjSpendBattery n, g')
        ObjGainEarthScore _ ->
            let (n, g') = randomR (30, 80 :: Int) g in (ObjGainEarthScore n, g')
        ObjVisitPlanetTypes _ ->
            let (n, g') = randomR (2, 3 :: Int) g in (ObjVisitPlanetTypes n, g')
        ObjReachCell _ ->
            let (dx, g1') = randomR (-8, 8 :: Int) g
                (dy, g2') = randomR (-8, 8 :: Int) g1'
                Pos x y = pos
                clamp a = max 0 (min (cfgMapWidth cfg - 1) a)
            in (ObjReachCell (Pos (clamp (x + dx)) (clamp (y + dy))), g2')
        ObjDoAllFour -> (ObjDoAllFour, g)
        ObjCraftDifferent _ ->
            let (n, g') = randomR (2, 3 :: Int) g in (ObjCraftDifferent n, g')
        ObjEndInRadiation -> (ObjEndInRadiation, g)
        ObjSquareDance -> (ObjSquareDance, g)

    pickReward ObjEasy g =
        let (i, g1') = randomR (0, 2 :: Int) g
            (n, g2') = randomR (15, 25 :: Int) g1'
        in case i of
            0 -> (RewardBattery n, g2')
            1 -> (RewardResources (Map.fromList [(Spinel, n), (Amethyst, 5)]), g2')
            _ -> (RewardResources (Map.fromList [(HollyBlueAgate, 5), (Peridot, 3)]), g2')
    pickReward ObjMedium g =
        let (i, g1') = randomR (0, 3 :: Int) g
            (n, g2') = randomR (10, 20 :: Int) g1'
        in case i of
            0 -> (RewardAugment Silver, g2')
            1 -> (RewardResources (Map.fromList [(Topaz, n), (Jasper, n)]), g2')
            2 -> (RewardActiveItem IT_Battery, g2')
            _ -> (RewardResources (Map.fromList [(Carnelian, 8), (Topaz, 8)]), g2')
    pickReward ObjHard g =
        let (i, g1') = randomR (0, 3 :: Int) g
        in case i of
            0 -> (RewardAugment Gold, g1')
            1 -> (RewardResources (Map.singleton PinkDiamond 1), g1')
            2 -> (RewardActiveItem IT_BlackHole, g1')
            _ -> (RewardCombo
                    [ RewardAugment Gold
                    , RewardResources (Map.fromList [(PinkDiamond, 1), (Topaz, 15)])
                    ]
                 , g1')

    objectivePoolFor ObjEasy =
        [ ObjMineTimes 0, ObjMoveCells 0, ObjScanTimes 0, ObjOpenCrates 0
        , ObjUseWormholes 0, ObjDepositTimes 0, ObjCraftItems 0, ObjUseItems 0
        , ObjMineResources 0, ObjDoNothing ]
    objectivePoolFor ObjMedium =
        [ ObjMoveCells 0, ObjMineTimes 0, ObjVisitPlanets 0, ObjSpendBattery 0
        , ObjUseItems 0, ObjCraftItems 0, ObjGainEarthScore 0, ObjOpenCrates 0
        , ObjUseWormholes 0, ObjReachCell (Pos 0 0), ObjDoAllFour
        , ObjVisitPlanetTypes 0 ]
    objectivePoolFor ObjHard =
        [ ObjMoveCells 0, ObjMineTimes 0, ObjGainEarthScore 0, ObjCraftDifferent 0
        , ObjUseWormholes 0, ObjDoNothing, ObjOpenCrates 0, ObjScanTimes 0
        , ObjEndInRadiation, ObjSquareDance ]

-- ═══════════════════════════════════════════════════════════════════════════
-- AUGMENTS
-- ═══════════════════════════════════════════════════════════════════════════

-- | Sinh 3 augment offer ngau nhien (silver/gold/diamond).
-- Duoc goi tu 'newGame' (cho round 1) va tu 'Game.Turn.endTurn' (cac round sau).
generateAugments :: StdGen -> ([AugmentOffer], StdGen)
generateAugments g0 = go 0 g0
  where
    go n g
        | n == 3 = ([], g)
        | otherwise =
            let (rarityRoll, g1) = randomR (1, 100 :: Int) g
                rarity = if rarityRoll <= 50 then Silver
                         else if rarityRoll <= 85 then Gold
                         else Diamond
                (typeIdx, g2) = randomR (0, fromEnum (maxBound :: AugmentType)) g1
                augT = toEnum typeIdx
                (rest, g3) = go (n + 1) g2
            in (AugmentOffer n augT rarity : rest, g3)