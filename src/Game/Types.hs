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
      -- * Zone (Phase 2)
    , ZoneType (..)
    , ZoneShape (..)
    , ZoneId
    , Zone (..)
      -- * Wormhole (Phase 1)
    , WormholeId
    , Wormhole (..)
      -- * Crate (Phase 3)
    , CrateId
    , LootItem (..)
    , TrapType (..)
    , CrateContent (..)
    , Crate (..)
      -- * Objective (Phase 4)
    , ObjectiveDifficulty (..)
    , ObjectiveType (..)
    , ObjectiveReward (..)
    , Objective (..)
    , ObjectiveTrackers (..)
    , emptyTrackers
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
    , playerKnownWormholes :: Map.Map WormholeId Wormhole  -- ^ cong khong gian da kham pha
    , playerObjectives     :: [Objective]                  -- ^ 3 nhiem vu hien tai
    , playerTrackers       :: ObjectiveTrackers            -- ^ tien do nhiem vu trong luot
    , playerCargoPenaltyTurns :: Int                       -- ^ so luot con bi phat cargo tu trap
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
    , gsWormholes     :: Map.Map WormholeId Wormhole  -- ^ tat ca cong khong gian
    , gsZones         :: Map.Map ZoneId Zone          -- ^ cac vung hien tai
    , gsCrates        :: Map.Map CrateId Crate        -- ^ cac hom tiep te dang co
    , gsNextCrateId   :: Int
    , gsNextZoneId    :: Int
    , gsNextObjId     :: Int
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
    | OpenCrate                   -- ^ mo hom tiep te dang dung tren (0 AP)
    | ClaimObjective Int          -- ^ nhan thuong nhiem vu da hoan thanh (0 AP)
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
    | InJammedZone            -- ^ dung trong vung nhieu song, khong the quet
    | NoCrateHere             -- ^ khong dung tren hom tiep te
    | ObjectiveNotComplete    -- ^ nhiem vu chua hoan thanh, khong the nhan thuong
    | ObjectiveAlreadyClaimed -- ^ nhiem vu da nhan thuong
    | ObjectiveNotFound       -- ^ khong co nhiem vu voi id do
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
    | WormholeEntered Pos Pos                -- ^ from, to
    | CrateOpened [LootItem]                 -- ^ loot nhan duoc
    | TrapTriggered TrapType                 -- ^ trap kich hoat khi mo hom
    | ZoneEntered ZoneType                   -- ^ thong bao vao zone
    | ZoneEndedTurn ZoneType Int             -- ^ radiation drain cuoi luot
    | ObjectiveClaimed Int ObjectiveReward   -- ^ objectiveId, reward
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

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 2: ZONES
-- ═══════════════════════════════════════════════════════════════════════════

-- | Nam loai vung moi truong, reset moi vong.
data ZoneType = ZoneJamming | ZoneRadiation | ZoneZeroG | ZoneSwamp | ZoneGoldRush
    deriving (Show, Eq, Ord, Enum, Bounded)

-- | Ma so cua zone.
type ZoneId = Int

-- | Hinh dang zone: tron (Manhattan radius) hoac chu nhat.
data ZoneShape
    = ZoneCircle Int        -- ^ ban kinh Manhattan
    | ZoneRect Int Int      -- ^ width, height
    deriving (Show, Eq)

-- | Mot vung tren map. Vi tri la tam (cho tron) hoac tam hinh chu nhat.
data Zone = Zone
    { zoneId    :: ZoneId
    , zoneType  :: ZoneType
    , zoneShape :: ZoneShape
    , zonePos   :: Pos
    } deriving (Show, Eq)

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 1: WORMHOLES
-- ═══════════════════════════════════════════════════════════════════════════

-- | Ma so cua cong khong gian.
type WormholeId = Int

-- | Mot dau cong khong gian. Moi cong noi voi dung 1 cong khac qua 'wormholePairedWith'.
data Wormhole = Wormhole
    { wormholeId         :: WormholeId
    , wormholePos        :: Pos
    , wormholePairedWith :: WormholeId
    } deriving (Show, Eq)

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 3: CRATES
-- ═══════════════════════════════════════════════════════════════════════════

-- | Ma so cua hom tiep te.
type CrateId = Int

-- | Mot loai loot trong hom.
data LootItem
    = LootResources Resources
    | LootActiveItem ItemId
    | LootPassiveItem ItemId
    | LootAugment Rarity
    deriving (Show, Eq)

-- | Cac loai bay (trap) co the gap khi mo hom.
data TrapType
    = TrapBatteryLeak Int          -- ^ -N battery
    | TrapMagneticStorm Int        -- ^ -N battery (nang hon)
    | TrapItemThief                -- ^ mat 1 active item random
    | TrapPassiveThief             -- ^ mat 1 passive item random
    | TrapTax Int                  -- ^ -N diem Earth
    | TrapTeleportRandom Int Int   -- ^ teleport ngau nhien trong khoang [min, max]
    | TrapCargoLeak Int Int        -- ^ -N cargo capacity trong M luot
    | TrapPlunder Int              -- ^ mat N don vi tai nguyen dat nhat
    | TrapAPDrain Int              -- ^ -N AP luot hien tai
    | TrapNextAPDrain Int          -- ^ -N AP luot sau
    | TrapEmptyCrate               -- ^ hom rong (troll)
    | TrapHomecoming               -- ^ teleport ve Earth
    | TrapRadiation Int Int        -- ^ -N battery, -M diem Earth
    | TrapMiniBlackHole Int        -- ^ -N battery
    | TrapMixed Int Int Int        -- ^ -N battery, -M AP luot sau, -K diem
    deriving (Show, Eq)

-- | Noi dung cua hom: loot thuong hoac trap.
data CrateContent
    = CrateLoot [LootItem]
    | CrateTrap TrapType
    deriving (Show, Eq)

-- | Mot hom tiep te tren map.
data Crate = Crate
    { crateId           :: CrateId
    , cratePos          :: Pos
    , crateContent      :: CrateContent
    , crateSpawnedRound :: Int
    } deriving (Show, Eq)

-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 4: SECRET OBJECTIVES
-- ═══════════════════════════════════════════════════════════════════════════

-- | Do kho cua nhiem vu.
data ObjectiveDifficulty = ObjEasy | ObjMedium | ObjHard
    deriving (Show, Eq, Ord, Enum, Bounded)

-- | Loai nhiem vu. Cac so trong constructor la nguong can dat.
data ObjectiveType
    = ObjMineTimes Int
    | ObjMoveCells Int
    | ObjScanTimes Int
    | ObjOpenCrates Int
    | ObjUseWormholes Int
    | ObjDepositTimes Int
    | ObjCraftItems Int
    | ObjUseItems Int
    | ObjMineResources Int
    | ObjDoNothing
    | ObjVisitPlanets Int
    | ObjSpendBattery Int
    | ObjGainEarthScore Int
    | ObjVisitPlanetTypes Int
    | ObjReachCell Pos
    | ObjDoAllFour
    | ObjCraftDifferent Int
    | ObjEndInRadiation
    | ObjSquareDance
    deriving (Show, Eq)

-- | Phan thuong khi claim nhiem vu.
data ObjectiveReward
    = RewardBattery Int
    | RewardResources Resources
    | RewardAugment Rarity
    | RewardActiveItem ItemId
    | RewardPassiveItem ItemId
    | RewardEarthScore Int
    | RewardAP Int
    | RewardCombo [ObjectiveReward]
    deriving (Show, Eq)

-- | Mot nhiem vu ca nhan. Player co 3 cai, reset moi vong.
data Objective = Objective
    { objId         :: Int
    , objDifficulty :: ObjectiveDifficulty
    , objType       :: ObjectiveType
    , objReward     :: ObjectiveReward
    , objCompleted  :: Bool
    , objClaimed    :: Bool
    , objTargetPos  :: Maybe Pos    -- ^ chi dung cho ObjReachCell
    } deriving (Show, Eq)

-- | Bo dem tien do nhiem vu, reset moi luot cua player.
data ObjectiveTrackers = ObjectiveTrackers
    { otCellsMoved              :: Int
    , otMinesThisTurn           :: Int
    , otScansThisTurn           :: Int
    , otCraftsThisTurn          :: Int
    , otCraftedItems            :: [ItemId]
    , otItemsUsedThisTurn       :: Int
    , otDepositsThisTurn        :: Int
    , otCratesOpenedThisTurn    :: Int
    , otWormholesUsedThisTurn   :: Int
    , otUniquePlanetsVisited    :: [PlanetId]
    , otUniquePlanetTypes       :: [PlanetType]
    , otBatterySpentThisTurn    :: Int
    , otEarthScoreAtStart       :: Int
    , otResourcesMinedThisTurn  :: Int
    , otDidMove                 :: Bool
    , otDidScan                 :: Bool
    , otDidMine                 :: Bool
    , otDidCraft                :: Bool
    , otDidUseItem              :: Bool
    , otDidDeposit              :: Bool
    , otMoveSequence            :: [Direction]
    , otEndedInRadiation        :: Bool
    , otReachedTargetPos        :: Bool
    } deriving (Show, Eq)

-- | Bo dem rong, dung khi reset luot moi.
emptyTrackers :: ObjectiveTrackers
emptyTrackers = ObjectiveTrackers
    { otCellsMoved = 0, otMinesThisTurn = 0, otScansThisTurn = 0
    , otCraftsThisTurn = 0, otCraftedItems = [], otItemsUsedThisTurn = 0
    , otDepositsThisTurn = 0, otCratesOpenedThisTurn = 0
    , otWormholesUsedThisTurn = 0, otUniquePlanetsVisited = []
    , otUniquePlanetTypes = [], otBatterySpentThisTurn = 0
    , otEarthScoreAtStart = 0, otResourcesMinedThisTurn = 0
    , otDidMove = False, otDidScan = False, otDidMine = False
    , otDidCraft = False, otDidUseItem = False, otDidDeposit = False
    , otMoveSequence = [], otEndedInRadiation = False
    , otReachedTargetPos = False
    }
