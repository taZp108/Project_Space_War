-- | Luat cua tung action: kiem tra dieu kien, tru chi phi, cap nhat trang thai.
--
-- Module nay khong lo chuyen luot hay kiem tra thang/thua (viec cua "Game.Turn").
module Game.Action
    ( performAction
    ) where

import Control.Monad (unless, when)
import Data.List (sortOn)
import qualified Data.Map.Strict as Map

import Game.Config
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
    Observe        -> doScanArea (cfgCostObserve cfg) (cfgObserveRadius cfg) pid gs
    ScanArea       -> doScanArea (cfgCostScanArea cfg) (cfgScanRadius cfg) pid gs
    ScanNearest    -> doScanNearest cfg pid gs
    ScanOpponent   -> doScanOpponent cfg pid gs
    Mine res       -> doMine cfg pid res gs
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
toKnown pl = KnownPlanet (planetPos pl) (planetType pl)

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
    unless (inBounds cfg target) (Left OutOfBounds)
    paid <- payCost (cfgCostMove cfg) player
    let moved = discoverHere gs (paid { playerPos = target })
    Right (setPlayer pid moved gs, report (Moved target))

-- | Dung chung cho Observe va ScanArea, chi khac ban kinh va chi phi.
doScanArea :: Cost -> Int -> PlayerId -> GameState -> Either GameError (GameState, ActionReport)
doScanArea cost radius pid gs = do
    let player = getPlayer pid gs
        visible =
            [ pl
            | pl <- Map.elems (gsPlanets gs)
            , withinRadius radius (playerPos player) (planetPos pl)
            ]
    paid <- payCost cost player
    let learned = foldr learn paid visible
    Right (setPlayer pid learned gs, report (PlanetsFound (map toKnown visible)))

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
        free = cfgCargoCapacity cfg - totalUnits (playerCargo player)
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
            }
    Right (setPlayer pid player' gs, report (Deposited deposited))

doRecharge
    :: Config -> PlayerId -> ResourceType -> Int -> GameState
    -> Either GameError (GameState, ActionReport)
doRecharge cfg pid res n gs = do
    let player = getPlayer pid gs
    when (n <= 0) (Left InvalidAmount)
    when (playerPos player /= gsEarth gs) (Left NotAtEarth)
    when (playerBattery player >= cfgBatteryMax cfg) (Left BatteryFull)
    remaining <- maybe (Left NotEnoughResources) Right
        (removeResources (playerStorage player) (Map.singleton res n))
    paid <- payCost (cfgCostRecharge cfg) player
    let value = n * Map.findWithDefault 0 res (cfgResourceValue cfg)
        newBattery = min (cfgBatteryMax cfg) (playerBattery paid + value * cfgRechargeRate cfg)
        gained = newBattery - playerBattery paid
        player' = paid { playerBattery = newBattery, playerStorage = remaining }
    Right (setPlayer pid player' gs, report (Recharged gained))