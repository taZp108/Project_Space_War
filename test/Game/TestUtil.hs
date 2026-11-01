-- | Du lieu dung chung cho cac test: mot tran nho, de doan truoc.
module Game.TestUtil
    ( cfg
    , testPlanet
    , baseState
    , rs
    , ok
    ) where

import qualified Data.Map.Strict as Map

import Game.Config
import Game.Generate
import Game.State
import Game.Types

-- | Cau hinh mac dinh.
cfg :: Config
cfg = defaultConfig

-- | Hanh tinh duy nhat trong 'baseState', nam o (60, 60).
testPlanet :: Planet
testPlanet = Planet 1 (Pos 60 60) Mining (rs [(Iron, 80), (Crystal, 30)]) False Nothing
-- | Tao kho tai nguyen tu danh sach.
rs :: [(ResourceType, Int)] -> Resources
rs = Map.fromList

-- | Tran de test: mot hanh tinh o (60,60), Player1 o Earth (50,50),
-- Player2 o (50,40), vong 1, Player1 di truoc.
baseState :: GameState
baseState =
    modifyPlayer Player1 (\p -> p { playerPos = Pos 50 50 })
    (modifyPlayer Player2 (\p -> p { playerPos = Pos 50 40 })
    ((newGame cfg 1) { gsPlanets = Map.singleton 1 testPlanet }))

-- | Lay gia tri thanh cong; neu la loi thi bao loi lam test hong (chi dung trong test).
ok :: Show e => Either e a -> a
ok = either (error . ("expected success but got: " ++) . show) id
