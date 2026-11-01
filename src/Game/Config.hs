-- | Moi thong so cua game nam o day de chinh sua o mot cho.
--
-- Cac con so trong 'defaultConfig' la gia tri tam, se can bang lai sau.
module Game.Config
    ( Cost (..)
    , Config (..)
    , defaultConfig
    , configV2
    , earthPosition
    ) where

import qualified Data.Map.Strict as Map

import Game.Types

-- | Chi phi cua mot action.
data Cost = Cost
    { costAP      :: Int
    , costBattery :: Int
    } deriving (Show, Eq)

-- | Cac thong so cua game.
data Config = Config
    { cfgMapWidth         :: Int
    , cfgMapHeight        :: Int
    , cfgPlanetCounts     :: Map.Map PlanetType Int   -- ^ so hanh tinh moi loai
    , cfgPlanetStock      :: Map.Map PlanetType Resources  -- ^ ton kho ban dau moi loai
    , cfgPlanetMinEarthDist :: Int                    -- ^ hanh tinh cach Earth toi thieu
    , cfgSpawnMinDist     :: Int
    , cfgSpawnMaxDist     :: Int
    , cfgBatteryMax       :: Int
    , cfgApMax            :: Int
    , cfgCargoCapacity    :: Int
    , cfgObserveRadius    :: Int
    , cfgScanRadius       :: Int
    , cfgMineAmount       :: Int                      -- ^ toi da moi lan Mine
    , cfgDepositRange     :: Int                      -- ^ tam gui hang ve Earth
    , cfgRechargeRate     :: Int                      -- ^ battery nhan duoc cho 1 diem tai nguyen
    , cfgResourceValue    :: Map.Map ResourceType Int -- ^ diem moi don vi
    , cfgResourceRarity   :: Map.Map ResourceType Int
    , cfgItemRecipes      :: Map.Map ItemId Resources
    , cfgMaxActiveSlots   :: Int
    , cfgScoreTarget      :: Int
    , cfgMaxRounds        :: Int
    , cfgCostMove         :: Cost
    , cfgCostObserve      :: Cost
    , cfgCostScanArea     :: Cost
    , cfgCostScanNearest  :: Cost
    , cfgCostScanOpponent :: Cost
    , cfgCostMine         :: Cost
    , cfgCostDepositAtEarth :: Cost
    , cfgCostDepositRemote  :: Cost
    , cfgCostRecharge     :: Cost
    , cfgAugmentInterval :: Int
      -- * Event Rates (moi)
    , cfgCanonEventChance       :: Int   -- ^ % xac suat trigger canon event moi round
    , cfgPlanetEventChance      :: Int   -- ^ % xac suat trigger planet event khi mine
      -- * Wormhole (Phase 1)
    , cfgWormholePairCount      :: Int
    , cfgWormholeMinDistance    :: Int
    , cfgWormholeEarthDist      :: Int
      -- * Zones (Phase 2)
    , cfgZoneSkipChance         :: Int   -- ^ % xac suat vong do KHONG co zone nao
    , cfgZoneCountMin           :: Int
    , cfgZoneCountMax           :: Int
    , cfgJammingRadiusMin       :: Int
    , cfgJammingRadiusMax       :: Int
    , cfgRadiationRadiusMin     :: Int
    , cfgRadiationRadiusMax     :: Int
    , cfgRadiationBatteryDrain  :: Int
    , cfgRadiationMineBonus     :: Int
    , cfgZeroGWidthMin          :: Int
    , cfgZeroGWidthMax          :: Int
    , cfgZeroGHeightMin         :: Int
    , cfgZeroGHeightMax         :: Int
    , cfgSwampRadiusMin         :: Int
    , cfgSwampRadiusMax         :: Int
    , cfgGoldRadiusMin          :: Int
    , cfgGoldRadiusMax          :: Int
    , cfgGoldResourceAmountMin  :: Int
    , cfgGoldResourceAmountMax  :: Int
      -- * Crates (Phase 3)
    , cfgCrateSpawnChance       :: Int   -- ^ % xac suat spawn crate moi vong
    , cfgCrateCountMin          :: Int
    , cfgCrateCountMax          :: Int
    , cfgCrateLifetime          :: Int   -- ^ so vong ton tai
    , cfgCrateMinEarthDist      :: Int
    , cfgCrateTrapChance        :: Int   -- ^ % xac suat hom la trap
      -- * Objectives (Phase 4)
    , cfgObjectiveCount         :: Int
      -- * Monolith & Beacon (Phase 5)
    , cfgMonolithCount          :: Int
    , cfgBeaconCount            :: Int
    , cfgBeaconRadius           :: Int
    , cfgMonolithBatteryCost    :: Int
    } deriving (Show, Eq)

-- | Cau hinh mac dinh theo spec v1.0.
defaultConfig :: Config
defaultConfig = Config
    { cfgMapWidth         = 100
    , cfgMapHeight        = 100
    , cfgPlanetCounts     = Map.fromList [(Mining, 80), (Energy, 50), (Rare, 30)]
    , cfgPlanetStock      = Map.fromList
        [ (Mining, Map.fromList [(Iron, 80), (Crystal, 30)])
        , (Energy, Map.fromList [(EnergyCore, 30), (Iron, 20), (Jasper, 10), (Amethyst, 20)])
        , (Rare,   Map.fromList [(RareOre, 8), (ExoticMatter, 2), (PinkDiamond, 2), (Topaz, 8)])
        ]
    , cfgPlanetMinEarthDist = 4
    , cfgSpawnMinDist     = 1
    , cfgSpawnMaxDist     = 5
    , cfgBatteryMax       = 100
    , cfgApMax            = 5
    , cfgCargoCapacity    = 120      -- tăng từ 50 → 120
    , cfgObserveRadius    = 3
    , cfgScanRadius       = 8
    , cfgMineAmount       = 5
    , cfgDepositRange     = 5
    , cfgRechargeRate     = 2
    , cfgResourceValue    = Map.fromList
        [(PinkDiamond, 50), (Spinel, 1), (HollyBlueAgate, 3), (Peridot, 5),
         (Topaz, 10), (Carnelian, 25), (Jasper, 15), (Amethyst, 2)]
    , cfgResourceRarity = Map.fromList
        [(PinkDiamond, 1), (Spinel, 6), (HollyBlueAgate, 5), (Peridot, 4),
         (Topaz, 3), (Carnelian, 2), (Jasper, 7), (Amethyst, 8)]
    , cfgItemRecipes = Map.fromList
        [ (IT_Teleport, Map.fromList [(PinkDiamond, 1), (Amethyst, 3)])
        , (IT_Battery, Map.fromList [(Peridot, 2), (Amethyst, 2)])
        , (IT_AP, Map.fromList [(Jasper, 2), (Amethyst, 2)])
        , (IT_CargoUp, Map.fromList [(HollyBlueAgate, 5), (Spinel, 5)])
        , (IT_BatteryMax, Map.fromList [(Peridot, 4), (HollyBlueAgate, 3)])
        , (IT_EcoEngine, Map.fromList [(Jasper, 3), (Topaz, 1)])
        , (IT_LuckUp, Map.fromList [(Carnelian, 2), (PinkDiamond, 1)])
        , (IT_BlackHole, Map.fromList [(PinkDiamond, 2), (Topaz, 3)])
        , (IT_SwapPos, Map.fromList [(Jasper, 2), (Topaz, 2)])
        , (IT_Scarecrow, Map.fromList [(Carnelian, 2), (Amethyst, 4)])
        , (IT_Steal, Map.fromList [(PinkDiamond, 1), (Jasper, 2)])
        , (IT_APBoost, Map.fromList [(Peridot, 2), (Topaz, 1)])
        , (IT_Magnet, Map.fromList [(Spinel, 5), (HollyBlueAgate, 2)])
        ]
    , cfgMaxActiveSlots = 3
    , cfgScoreTarget      = 1000     -- tăng từ 500 → 1000
    , cfgMaxRounds        = 150      -- tăng từ 100 → 150 (cân bằng với target 1000)
    , cfgCostMove         = Cost 1 2
    , cfgCostObserve      = Cost 1 1
    , cfgCostScanArea     = Cost 2 3
    , cfgCostScanNearest  = Cost 2 3
    , cfgCostScanOpponent = Cost 3 3
    , cfgCostMine         = Cost 2 1
    , cfgCostDepositAtEarth = Cost 1 0
    , cfgCostDepositRemote  = Cost 1 2
    , cfgCostRecharge     = Cost 1 0
    , cfgAugmentInterval = 2            -- giảm 3→2: augment mỗi 2 round thay vì 3
      -- * Event Rates (moi)
    , cfgCanonEventChance       = 50    -- tăng 30→50: 50% round có canon event
    , cfgPlanetEventChance      = 30    -- tăng 15→30: 30% lần mine trigger planet event
      -- * Wormhole (Phase 1)
    , cfgWormholePairCount      = 10    -- tăng 7→10: 20 cổng (10 cặp)
    , cfgWormholeMinDistance    = 8     -- giảm 10→8: cổng gần nhau hơn (dễ tìm cặp hơn)
    , cfgWormholeEarthDist      = 8     -- giảm 10→8: cổng có thể gần Earth hơn
      -- * Zones (Phase 2)
    , cfgZoneSkipChance         = 5        -- 5% round trống zone (95% có zone)
    , cfgZoneCountMin           = 4        -- tối thiểu 4 zone/round
    , cfgZoneCountMax           = 9        -- tối đa 9 zone/round
    , cfgJammingRadiusMin       = 8        -- Jamming to hơn
    , cfgJammingRadiusMax       = 18       -- radius max 18 (gần gấp đôi 14)
    , cfgRadiationRadiusMin     = 5
    , cfgRadiationRadiusMax     = 10
    , cfgRadiationBatteryDrain  = 5
    , cfgRadiationMineBonus     = 50
    , cfgZeroGWidthMin          = 14       -- ZeroG rect to hơn
    , cfgZeroGWidthMax          = 22       -- rộng tối đa 22 ô
    , cfgZeroGHeightMin         = 8        -- cao tối thiểu 8 ô
    , cfgZeroGHeightMax         = 12       -- cao tối đa 12 ô
    , cfgSwampRadiusMin         = 7        -- Swamp to hơn
    , cfgSwampRadiusMax         = 12
    , cfgGoldRadiusMin          = 4        -- Gold to hơn
    , cfgGoldRadiusMax          = 7
    , cfgGoldResourceAmountMin  = 1
    , cfgGoldResourceAmountMax  = 2
      -- * Crates (Phase 3)
    , cfgCrateSpawnChance       = 60    -- tăng 30→60: 60% round có crate
    , cfgCrateCountMin          = 2     -- tăng 1→2: tối thiểu 2 crate/round
    , cfgCrateCountMax          = 5     -- tăng 3→5: tối đa 5 crate/round
    , cfgCrateLifetime          = 4     -- tăng 3→4: crate tồn tại 4 round
    , cfgCrateMinEarthDist      = 5
    , cfgCrateTrapChance        = 30    -- tăng 20→30: 30% crate là trap
      -- * Objectives (Phase 4)
    , cfgObjectiveCount         = 3
      -- * Monolith & Beacon (Phase 5)
    , cfgMonolithCount          = 8
    , cfgBeaconCount            = 8
    , cfgBeaconRadius           = 15
    , cfgMonolithBatteryCost    = 20
    }

-- | Cau hinh v2: AP toi da tang len 10 de cho phep di chuyen xa hon trong 1 luot.
-- Cac thong so khac giu nguyen nhu 'defaultConfig'.
--
-- Dung bang cach doi 'defaultConfig' thanh 'configV2' trong app/Main.hs.
configV2 :: Config
configV2 = defaultConfig { cfgApMax = 15 }



-- | Vi tri Earth: giua map (rong chia 2, cao chia 2). Mac dinh la (50, 50).
earthPosition :: Config -> Pos
earthPosition cfg = Pos (cfgMapWidth cfg `div` 2) (cfgMapHeight cfg `div` 2)
