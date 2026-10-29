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

import Game.Config
import Game.State
import Game.Types

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
    } deriving (Show, Eq)

-- | Thong tin cuoi cung cua mot nguoi choi, lo ra khi tran ket thuc.
data PlayerFinal = PlayerFinal
    { finalPos   :: Pos
    , finalScore :: Int
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
    , viewBatteryMax    = cfgBatteryMax cfg
    , viewAP            = playerAP me
    , viewApMax         = cfgApMax cfg
    , viewCargo         = playerCargo me
    , viewCargoCapacity = cfgCargoCapacity cfg
    , viewStorage       = playerStorage me
    , viewScore         = playerScore cfg me
    , viewScoreTarget   = cfgScoreTarget cfg
    , viewKnown         = playerKnown me
    , viewHere          = planetAt (playerPos me) gs
    }
  where
    me = getPlayer pid gs

-- | Ban tong ket: vi tri va diem cuoi cua ca hai nguoi choi.
summaryOf :: Config -> GameState -> GameSummary
summaryOf cfg gs = GameSummary (final (gsPlayer1 gs)) (final (gsPlayer2 gs))
  where
    final p = PlayerFinal (playerPos p) (playerScore cfg p)