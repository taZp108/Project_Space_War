-- | Cac kieu du lieu cot loi cua game (chi la du lieu, chua co luat choi).
--
-- Luat choi nam o cac module khac (@Game.World@, @Game.Action@, ...).

{-# LANGUAGE PatternSynonyms #-}
module Game.Types
    ( -- * Vi tri va huong
      Pos (..)
    , Direction (..)
    , Compass (..)
      -- * Tai nguyen
    , ResourceType (..)
    , pattern Iron
    , pattern Crystal
    , pattern EnergyCore
    , pattern RareOre
    , pattern ExoticMatter
    , Resources
    , ItemId (..)
    , ItemType (..)
    , Inventory (..)
    , Rarity (..)
    , AugmentType (..)
    , AugmentOffer (..)
    , PlanetEvent (..)
    , CanonEvent (..)
    , EventNotification (..)
      -- * Hanh tinh
    , PlanetType (..)
    , PlanetId
    , Planet (..)
    , KnownPlanet (..)
      -- * Nguoi choi
    , PlayerId (..)
    , Player (..)
      -- * Trang thai game
    , WinReason (..)
    , GameResult (..)
    , GamePhase (..)
    , GameState (..)
      -- * Hanh dong
    , Action (..)
    , GameError (..)
    , Notice (..)
    , ActionResult (..)
    , ActionReport (..)
    ) where

import qualified Data.Map.Strict as Map
import System.Random (StdGen)

-- | Toa do tren map. @posX@ tang sang phai, @posY@ tang xuong duoi.
data Pos = Pos
    { posX :: Int
    , posY :: Int
    } deriving (Show, Eq, Ord)

-- | Bon huong di chuyen. 'DirUp' lam giam @posY@ di 1.
data Direction = DirUp | DirDown | DirLeft | DirRight
    deriving (Show, Eq, Ord, Enum, Bounded)

-- | Tam huong (8 phia) dung cho ket qua scan. 'Here' nghia la cung o.
data Compass
    = North | NorthEast | East | SouthEast
    | South | SouthWest | West | NorthWest
    | Here
    deriving (Show, Eq, Ord, Enum, Bounded)

-- | Nam loai tai nguyen.
data ResourceType = PinkDiamond | Spinel | HollyBlueAgate | Peridot
                  | Topaz | Carnelian | Jasper | Amethyst
    deriving (Show, Eq, Ord, Enum, Bounded)

pattern Iron, Crystal, EnergyCore, RareOre, ExoticMatter :: ResourceType
pattern Iron = Spinel
pattern Crystal = HollyBlueAgate
pattern EnergyCore = Peridot
pattern RareOre = Topaz
pattern ExoticMatter = Carnelian

-- | So luong tung loai tai nguyen (loai khong co trong bang nghia la 0).
type Resources = Map.Map ResourceType Int

-- | Ba loai hanh tinh cua ban MVP.
data PlanetType = Mining | Energy | Rare
    deriving (Show, Eq, Ord, Enum, Bounded)

-- | Ma so cua hanh tinh (1, 2, 3, ...).
type PlanetId = Int

-- | Mot hanh tinh. 'planetStock' la ton kho con lai, dung chung cho hai nguoi.
data Planet = Planet
    { planetId    :: PlanetId
    , planetPos   :: Pos
    , planetType  :: PlanetType
    , planetStock :: Resources
    , planetEventTriggered :: Bool
    , planetEventType :: Maybe PlanetEvent
    } deriving (Show, Eq)

-- | Thong tin ve mot hanh tinh ma nguoi choi da kham pha (vi tri va loai).
data KnownPlanet = KnownPlanet
    { knownPos  :: Pos
    , knownType :: PlanetType
    , knownStock :: Maybe Resources
    , knownEvent :: Maybe PlanetEvent
    } deriving (Show, Eq)

-- | Hai nguoi choi.
data PlayerId = Player1 | Player2
    deriving (Show, Eq, Ord, Enum, Bounded)

-- | Trang thai cua mot nguoi choi.
data Player = Player
    { playerPos     :: Pos
    , playerBattery :: Int
    , playerAP      :: Int
    , playerCargo   :: Resources                      -- ^ kho tren tau
    , playerStorage :: Resources                      -- ^ kho rieng tai Earth
    , playerKnown   :: Map.Map PlanetId KnownPlanet   -- ^ hanh tinh da kham pha
    , playerInventory :: Inventory
    , playerLuck :: Int
    , playerActiveSlotPenalty :: Int
    , playerNextTurnAPPenalty :: Int
    , playerCargoJam         :: Int      
    , playerTotalDeposited   :: Resources 
    , playerAugments :: [AugmentOffer]
    } deriving (Show, Eq)

-- | Ly do thang.
data WinReason
    = ReachedTarget          -- ^ du diem o kho Earth
    | OpponentOutOfBattery   -- ^ doi thu het battery
    | OpponentDisconnected   -- ^ doi thu mat ket noi
    | HigherScoreAtLimit     -- ^ het so vong, diem Earth cao hon
    deriving (Show, Eq)

-- | Ket qua cua mot tran.
data GameResult
    = Winner PlayerId WinReason
    | Draw
    deriving (Show, Eq)

-- | Giai doan cua tran dau.
data GamePhase
    = WaitingForPlayers
    | InProgress
    | Finished GameResult
    deriving (Show, Eq)

-- | Toan bo trang thai cua mot tran. Server giu ban day du nay.
data GameState = GameState
    { gsMapWidth  :: Int
    , gsMapHeight :: Int
    , gsEarth     :: Pos
    , gsPlanets   :: Map.Map PlanetId Planet
    , gsPlayer1   :: Player
    , gsPlayer2   :: Player
    , gsCurrent   :: PlayerId     -- ^ nguoi dang co luot
    , gsRound     :: Int          -- ^ vong hien tai (1 vong = luot P1 roi luot P2)
    , gsPhase     :: GamePhase
    , gsRng       :: StdGen       -- ^ bo sinh so ngau nhien
    , gsActiveCanonEvent :: Maybe CanonEvent
    , gsPendingAugments :: Maybe [AugmentOffer]
    , gsAugmentChoices :: Map.Map PlayerId Int
    } deriving (Show, Eq)


    -- | Cac hanh dong nguoi choi co the lam trong luot cua minh.
data Action
    = Move Direction
    | MoveTo Pos
    | Observe
    | ScanArea
    | ScanNearest
    | ScanOpponent
    | Mine ResourceType
    | MineRandom
    | Craft ItemId
    | UseItem ItemId
    | Deposit
    | Recharge ResourceType Int   -- ^ loai tai nguyen va so luong dung de nap
    | EndTurn
    deriving (Show, Eq)

-- | Ly do mot action bi tu choi (khi bi tu choi thi khong mat gi).
data GameError
    = GameNotInProgress       -- ^ tran chua bat dau hoac da ket thuc
    | NotYourTurn
    | NotEnoughAP
    | NotEnoughBattery
    | OutOfBounds             -- ^ di ra ngoai map
    | NotOnPlanet             -- ^ Mine khi khong dung tren hanh tinh
    | PlanetHasNoSuchResource -- ^ hanh tinh khong con loai tai nguyen do
    | CargoFull
    | CargoEmpty              -- ^ Deposit khi cargo rong
    | NotAtEarth              -- ^ Recharge khi khong dung o Earth
    | OutOfDepositRange       -- ^ Deposit khi qua xa Earth
    | BatteryFull             -- ^ Recharge khi battery da day
    | NotEnoughResources      -- ^ kho Earth khong du tai nguyen de nap
    | InvalidAmount           -- ^ so luong khong hop le (<= 0)
    | ItemUnavailable
    | InventoryFull
    deriving (Show, Eq)

-- | Thong bao gui cho doi thu khi ban lam mot action.
data Notice = YouWereScanned
    deriving (Show, Eq)

-- | Ket qua rieng cua tung action danh cho nguoi hanh dong.
data ActionResult
    = Moved Pos
    | PlanetsFound [KnownPlanet]
    | NearestPlanet (Maybe (Compass, Int))   -- ^ huong va khoang cach, hoac khong con hanh tinh
    | OpponentDirection Compass
    | Mined ResourceType Int
    | MinedAll Resources     
    | Deposited Resources
    | Recharged Int                          -- ^ so battery thuc su nhan duoc
    | TurnEnded
    | PlanetEventOccurred PlanetEvent ActionResult Bool
    | CanonEventOccurred CanonEvent ActionResult
    | ItemCrafted ItemId
    | ItemUsed ItemId
    deriving (Show, Eq)

-- | Bao cao cua mot action thanh cong.
data ActionReport = ActionReport
    { reportResult :: ActionResult
    , reportNotice :: Maybe Notice   -- ^ thong bao cho doi thu, neu co
    } deriving (Show, Eq)

data ItemId = IT_Teleport | IT_Battery | IT_AP | IT_CargoUp | IT_BatteryMax
            | IT_EcoEngine | IT_LuckUp | IT_BlackHole | IT_SwapPos
            | IT_Scarecrow | IT_Steal | IT_APBoost | IT_Magnet
    deriving (Show, Eq, Ord, Enum, Bounded)

data ItemType = Passive | Active deriving (Show, Eq, Ord)

data Inventory = Inventory
    { invPassives :: Map.Map ItemId Int
    , invActives :: [ItemId]
    } deriving (Show, Eq)

data PlanetEvent = EV_LavaCore | EV_Radiation | EV_GreedyPlanet
                 | EV_SpaceAnchor | EV_Parasite | EV_Mirage
                 | EV_CargoJam  
                 | EV_Surge  
    deriving (Show, Eq, Ord, Enum, Bounded)

data CanonEvent = CE_BlackHole | CE_Tax | CE_ReverseGravity
                | CE_GalacticFair | CE_SolarStorm | CE_TwinPlanet
                | CE_Homecoming   
                | CE_GiftItem    
                | CE_TheftItem    
                | CE_SupplyDrop  
                | CE_Plunder    
    deriving (Show, Eq, Ord, Enum, Bounded)

data Rarity = Silver | Gold | Diamond deriving (Show, Eq, Ord, Enum, Bounded)

data AugmentType = Aug_BatteryMax | Aug_MoveCost | Aug_CargoMax | Aug_APMax 
                 | Aug_Midas | Aug_Luck | Aug_ScanRadius | Aug_CraftDiscount
  deriving (Show, Eq, Ord, Enum, Bounded)

data AugmentOffer = AugmentOffer 
    { offerId :: Int 
    , augType :: AugmentType 
    , augRarity :: Rarity
    } deriving (Show, Eq)

data EventNotification = EventNotification
    { eventName :: String
    , effectDesc :: String
    , eventKind :: String
    } deriving (Show, Eq)
