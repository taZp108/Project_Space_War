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
    } deriving (Show, Eq)

-- | Cau hinh mac dinh theo spec v1.0.
defaultConfig :: Config
defaultConfig = Config
    { cfgMapWidth         = 100
    , cfgMapHeight        = 100
    , cfgPlanetCounts     = Map.fromList [(Mining, 40), (Energy, 24), (Rare, 16)]
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
    , cfgCargoCapacity    = 50
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
    , cfgScoreTarget      = 500
    , cfgMaxRounds        = 100
    , cfgCostMove         = Cost 1 2
    , cfgCostObserve      = Cost 1 1
    , cfgCostScanArea     = Cost 2 3
    , cfgCostScanNearest  = Cost 2 3
    , cfgCostScanOpponent = Cost 3 3
    , cfgCostMine         = Cost 2 1
    , cfgCostDepositAtEarth = Cost 1 0
    , cfgCostDepositRemote  = Cost 1 2
    , cfgCostRecharge     = Cost 1 0
    , cfgAugmentInterval = 3
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
