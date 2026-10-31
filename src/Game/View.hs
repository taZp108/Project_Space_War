-- | Chieu 'GameState' thanh phan ma mot nguoi choi duoc phep biet.
--
-- Server giu 'GameState' day du, nhung chi gui 'PlayerView' cho tung nguoi.
-- Trong luc choi, 'PlayerView' khong chua vi tri, kho hay diem cua doi thu,
-- khong chua hanh tinh chua kham pha. Khi tran ket thuc, 'summaryOf' tao
-- ban tong ket lo diem va vi tri cuoi cua ca hai ben.
module Game.View
    ( PlayerView (..)
    , PlayerFinal (..)
    , GameSummary (..)
    , viewFor
    , summaryOf
    ) where

import qualified Data.Map.Strict as Map

import Game.Action (crateAt)
import Game.Config
import Game.State
import Game.Types
import Game.World (distance)

-- | Nhung gi mot nguoi choi duoc thay.
data PlayerView = PlayerView
    { viewSelf          :: PlayerId
    , viewMapWidth      :: Int
    , viewMapHeight     :: Int
    , viewEarth         :: Pos
    , viewRound         :: Int
    , viewMaxRounds     :: Int
    , viewCurrent       :: PlayerId      -- ^ ai dang co luot
    , viewPhase         :: GamePhase
    , viewPos           :: Pos
    , viewBattery       :: Int
    , viewBatteryMax    :: Int
    , viewAP            :: Int
    , viewApMax         :: Int
    , viewCargo         :: Resources
    , viewCargoCapacity :: Int
    , viewStorage       :: Resources
    , viewScore         :: Int           -- ^ chi diem cua chinh nguoi choi
    , viewScoreTarget   :: Int
    , viewKnown         :: Map.Map PlanetId KnownPlanet
    , viewHere          :: Maybe Planet  -- ^ hanh tinh dang dung tren (kem ton kho)
    , viewInventory     :: Inventory
    , viewLuck          :: Int
    , viewMaxCargo      :: Int
    , viewMaxBattery    :: Int
    , viewActiveEvent   :: Maybe CanonEvent
   , viewCanCraft      :: [ItemId]
    , viewTurnEndTime   :: Maybe Integer
    , viewAugments      :: [AugmentOffer]
      -- * Phase 1-4 (moi)
    , viewZones          :: [Zone]              -- ^ tat ca zone dang hoat dong
    , viewCrates         :: [Crate]             -- ^ tat ca hom tiep te dang co
    , viewKnownWormholes :: [Wormhole]          -- ^ cong khong gian da kham pha
    , viewObjectives     :: [Objective]         -- ^ 3 nhiem vu hien tai
    , viewCrateHere      :: Maybe Crate         -- ^ hom dang dung tren (neu co)
    , viewCurrentZone    :: Maybe ZoneType      -- ^ zone dang dung trong (neu co)
    } deriving (Show, Eq)

-- | Thong tin cuoi cung cua mot nguoi choi, lo ra khi tran ket thuc.
data PlayerFinal = PlayerFinal
    { finalPos   :: Pos
    , finalScore :: Int
    , finalDeposited :: Int  
    } deriving (Show, Eq)

-- | Ban tong ket cua hai nguoi choi khi tran ket thuc.
data GameSummary = GameSummary
    { summaryPlayer1 :: PlayerFinal
    , summaryPlayer2 :: PlayerFinal
    } deriving (Show, Eq)


-- | Phan trang thai ma nguoi choi nay duoc thay.
viewFor :: Config -> PlayerId -> GameState -> PlayerView
viewFor cfg pid gs = PlayerView
    { viewSelf          = pid
    , viewMapWidth      = gsMapWidth gs
    , viewMapHeight     = gsMapHeight gs
    , viewEarth         = gsEarth gs
    , viewRound         = gsRound gs
    , viewMaxRounds     = cfgMaxRounds cfg
    , viewCurrent       = gsCurrent gs
    , viewPhase         = gsPhase gs
    , viewPos           = playerPos me
    , viewBattery       = playerBattery me
    , viewBatteryMax    = playerMaxBattery cfg me
    , viewAP            = playerAP me
    , viewApMax         = cfgApMax cfg
    , viewCargo         = playerCargo me
    , viewCargoCapacity = playerMaxCargo cfg me
    , viewStorage       = playerStorage me
    , viewScore         = playerScore cfg me
    , viewScoreTarget   = cfgScoreTarget cfg
    , viewKnown         = playerKnown me
    , viewHere          = planetAt (playerPos me) gs
    , viewInventory     = playerInventory me
    , viewLuck          = playerLuck me
    , viewMaxCargo      = playerMaxCargo cfg me
    , viewMaxBattery    = playerMaxBattery cfg me
    , viewActiveEvent   = gsActiveCanonEvent gs
    , viewCanCraft      = [item | item <- [minBound .. maxBound], canAfford item]
    , viewTurnEndTime   = Nothing
    , viewAugments      = playerAugments me
    , viewZones          = Map.elems (gsZones gs)
    , viewCrates         = Map.elems (gsCrates gs)
    , viewKnownWormholes = Map.elems (playerKnownWormholes me)
    , viewObjectives     = playerObjectives me
    , viewCrateHere      = crateAt (playerPos me) gs
    , viewCurrentZone    = findZoneAt (playerPos me) gs
    }
  where
    me = getPlayer pid gs
    canAfford item = maybe False (const True) (removeResources (playerCargo me) (Map.findWithDefault Map.empty item (cfgItemRecipes cfg)))

-- | Ban tong ket: vi tri va diem cuoi cua ca hai nguoi choi.
summaryOf :: Config -> GameState -> GameSummary
summaryOf cfg gs = GameSummary (final (gsPlayer1 gs)) (final (gsPlayer2 gs))
  where
    final p = PlayerFinal
        (playerPos p)
        (playerScore cfg p)
        (totalUnits (playerTotalDeposited p))

-- | Tim zone tai pos (uu tien thu tu Jamming > Radiation > Swamp > ZeroG > Gold).
findZoneAt :: Pos -> GameState -> Maybe ZoneType
findZoneAt pos gs =
    let check ty = any (\z -> zoneType z == ty && pointInZone z pos) (Map.elems (gsZones gs))
    in case filter check [ZoneJamming, ZoneRadiation, ZoneSwamp, ZoneZeroG, ZoneGoldRush] of
         (ty:_) -> Just ty
         []     -> Nothing
  where
    pointInZone (Zone _ _ shape center) p = case shape of
        ZoneCircle r -> distance center p <= r
        ZoneRect w h ->
            let Pos cx cy = center
                Pos px py = p
                hw = w `div` 2
                hh = h `div` 2
            in px >= cx - hw && px <= cx + hw && py >= cy - hh && py <= cy + hh