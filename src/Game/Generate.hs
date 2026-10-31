-- | Sinh map, hanh tinh va vi tri xuat phat tu mot seed ngau nhien.
module Game.Generate
    ( newGame
    , generatePlanets
    , pickDistinct
    ) where

import qualified Data.Map.Strict as Map
import System.Random (StdGen, mkStdGen, randomR)

import Game.Config
import Game.Types
import Game.World

-- | Tao mot tran moi (da du hai nguoi, Player1 di truoc, vong 1).
-- Cung cau hinh va cung seed luon ra cung ket qua.
newGame :: Config -> Int -> GameState
newGame cfg seed = GameState
    { gsMapWidth  = cfgMapWidth cfg
    , gsMapHeight = cfgMapHeight cfg
    , gsEarth     = earth
    , gsPlanets   = planets
    , gsPlayer1   = newPlayer cfg spawn1
    , gsPlayer2   = newPlayer cfg spawn2
    , gsCurrent   = Player1
    , gsRound     = 1
    , gsPhase     = InProgress
    , gsRng       = g3
    , gsActiveCanonEvent = Nothing
    , gsPendingAugments = Nothing
    , gsAugmentChoices = Map.empty
    }
  where
    earth = earthPosition cfg
    (planets, g1) = generatePlanets cfg (mkStdGen seed)
    spawnCells = ringCells cfg earth (cfgSpawnMinDist cfg) (cfgSpawnMaxDist cfg)
    (spawn1, g2) = pickOne earth spawnCells g1
    (spawn2, g3) = pickOne earth spawnCells g2

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
    
    -- Sinh danh sách Planet ban đầu (chưa có Event)
    rawPlanets =
        [ Planet i c t (Map.findWithDefault Map.empty t (cfgPlanetStock cfg)) False Nothing
        | (i, c, t) <- zip3 [1 ..] cells shuffledTypes
        ]
        
    -- Gán ngẫu nhiên Event cho từng Planet
    (finalPlanets, g3) = assignEvents rawPlanets g2

-- | Boc ngau nhien @k@ phan tu khac nhau (khong lap) tu danh sach.
-- Neu @k@ bang do dai danh sach thi ket qua la mot hoan vi ngau nhien.
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


-- | Gán ngẫu nhiên một PlanetEvent cho mỗi hành tinh.
assignEvents :: [Planet] -> StdGen -> ([Planet], StdGen)
assignEvents [] g = ([], g)
assignEvents (p:ps) g =
    let (evIdx, g1) = randomR (0, fromEnum (maxBound :: PlanetEvent)) g
        ev = toEnum evIdx
        p' = p { planetEventType = Just ev }
        (rest, g2) = assignEvents ps g1
    in (p' : rest, g2)