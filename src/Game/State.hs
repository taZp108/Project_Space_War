-- | Ham tien ich de doc va cap nhat 'GameState' va tai nguyen.
module Game.State
    ( getPlayer
    , setPlayer
    , modifyPlayer
    , otherPlayer
    , planetAt
    , addResources
    , removeResources
    , totalUnits
    , resourcesValue
    , playerScore
    , playerMaxCargo
    , playerMaxBattery
    , playerMaxAP
    , playerMoveCost
    , playerObserveRadius
    , playerScanRadius
    , augmentBonus
    , itemType
    ) where

import Data.List (find)
import qualified Data.Map.Strict as Map

import Game.Config
import Game.Types

-- | Lay nguoi choi theo 'PlayerId'.
getPlayer :: PlayerId -> GameState -> Player
getPlayer Player1 = gsPlayer1
getPlayer Player2 = gsPlayer2

-- | Thay nguoi choi bang mot ban moi.
setPlayer :: PlayerId -> Player -> GameState -> GameState
setPlayer Player1 p gs = gs { gsPlayer1 = p }
setPlayer Player2 p gs = gs { gsPlayer2 = p }

-- | Ap dung mot ham len nguoi choi.
modifyPlayer :: PlayerId -> (Player -> Player) -> GameState -> GameState
modifyPlayer pid f gs = setPlayer pid (f (getPlayer pid gs)) gs

-- | Nguoi choi con lai.
otherPlayer :: PlayerId -> PlayerId
otherPlayer Player1 = Player2
otherPlayer Player2 = Player1

-- | Hanh tinh dang nam tai mot o (neu co).
planetAt :: Pos -> GameState -> Maybe Planet
planetAt pos gs = find ((== pos) . planetPos) (Map.elems (gsPlanets gs))

-- | Cong hai kho tai nguyen.
addResources :: Resources -> Resources -> Resources
addResources = Map.unionWith (+)

-- | Tru tai nguyen. Tra ve 'Nothing' neu kho khong du bat ky loai nao.
-- Ket qua khong chua loai co so luong 0.
removeResources :: Resources -> Resources -> Maybe Resources
removeResources have cost
    | any (< 0) (Map.elems diff) = Nothing
    | otherwise                  = Just (Map.filter (> 0) diff)
  where
    diff = Map.unionWith (+) have (Map.map negate cost)

-- | Tong so don vi tai nguyen.
totalUnits :: Resources -> Int
totalUnits = sum . Map.elems

-- | Tong diem cua mot kho tai nguyen.
resourcesValue :: Config -> Resources -> Int
resourcesValue cfg rs = sum
    [ n * Map.findWithDefault 0 t (cfgResourceValue cfg) | (t, n) <- Map.toList rs ]

-- | Diem cua nguoi choi (chi tinh kho Earth, khong tinh cargo).
playerScore :: Config -> Player -> Int
playerScore cfg = resourcesValue cfg . playerStorage




augmentBonus :: Player -> AugmentType -> Int
augmentBonus p t = sum [ bonus o | o <- playerAugments p, augType o == t ]
  where
    bonus o = case (t, augRarity o) of
      (Aug_BatteryMax, Silver) -> 20
      (Aug_BatteryMax, Gold)   -> 35
      (Aug_BatteryMax, Diamond)-> 50
      (Aug_CargoMax, Silver) -> 10
      (Aug_CargoMax, Gold)   -> 20
      (Aug_CargoMax, Diamond)-> 30
      (Aug_APMax, Silver) -> 1
      (Aug_APMax, Gold)   -> 2
      (Aug_APMax, Diamond)-> 3
      (Aug_MoveCost, Silver) -> 1
      (Aug_MoveCost, Gold)   -> 2
      (Aug_MoveCost, Diamond)-> 3
      (Aug_Luck, Silver) -> 10
      (Aug_Luck, Gold)   -> 20
      (Aug_Luck, Diamond)-> 30
      (Aug_CraftDiscount, Silver) -> 1
      (Aug_CraftDiscount, Gold)   -> 2
      (Aug_CraftDiscount, Diamond)-> 3
      _ -> 0

playerMaxCargo :: Config -> Player -> Int
playerMaxCargo cfg p = 
    max 10 (cfgCargoCapacity cfg 
        + 20 * Map.findWithDefault 0 IT_CargoUp (invPassives (playerInventory p))
        - playerCargoJam p
        + augmentBonus p Aug_CargoMax)

playerMaxBattery :: Config -> Player -> Int
playerMaxBattery cfg p = cfgBatteryMax cfg + 20 * Map.findWithDefault 0 IT_BatteryMax (invPassives (playerInventory p)) + augmentBonus p Aug_BatteryMax

playerMaxAP :: Config -> Player -> Int
playerMaxAP cfg p = cfgApMax cfg + augmentBonus p Aug_APMax

playerMoveCost :: Config -> Player -> Cost
playerMoveCost cfg p = 
    let Cost ap bat = cfgCostMove cfg
        engine = Map.findWithDefault 0 IT_EcoEngine (invPassives (playerInventory p))
        ecoDiscount = if engine > 0 then engine else augmentBonus p Aug_MoveCost
    in Cost ap (max 0 (bat - ecoDiscount))

playerScanRadius :: Config -> Player -> Int
playerScanRadius cfg p = cfgScanRadius cfg + augmentBonus p Aug_ScanRadius

playerObserveRadius :: Config -> Player -> Int
playerObserveRadius cfg p = cfgObserveRadius cfg + augmentBonus p Aug_ScanRadius

 
itemType :: ItemId -> ItemType
itemType IT_CargoUp = Passive
itemType IT_BatteryMax = Passive
itemType IT_EcoEngine = Passive
itemType IT_LuckUp = Passive
itemType _ = Active
