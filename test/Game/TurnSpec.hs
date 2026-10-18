module Game.TurnSpec (spec) where

import qualified Data.Map.Strict as Map
import Test.Hspec
import Test.Hspec.QuickCheck (modifyMaxSuccess)
import Test.QuickCheck

import Game.State
import Game.TestUtil
import Game.Turn
import Game.Types
import Game.World

-- | Chay mot action, bo qua bao cao.
step :: PlayerId -> Action -> GameState -> Either GameError GameState
step pid a gs = fmap fst (applyAction cfg pid a gs)

-- | Cho Player1 dung o vi tri co cargo de test Deposit.
carrying :: Pos -> Resources -> GameState
carrying pos cargo = modifyPlayer Player1 (\p -> p { playerPos = pos, playerCargo = cargo }) baseState

spec :: Spec
spec = do
  describe "kiem tra truoc khi lam" $ do
    it "khong phai luot cua minh thi bi tu choi" $
      step Player2 Observe baseState `shouldBe` Left NotYourTurn
    it "tran da ket thuc thi bi tu choi" $
      step Player1 Observe (baseState { gsPhase = Finished Draw }) `shouldBe` Left GameNotInProgress
    it "tran chua bat dau thi bi tu choi" $
      step Player1 Observe (baseState { gsPhase = WaitingForPlayers }) `shouldBe` Left GameNotInProgress
    it "action bi tu choi (loi cua Action) thi truyen loi len" $
      step Player1 (Mine Iron) baseState `shouldBe` Left NotOnPlanet

  describe "doi luot" $ do
    it "EndTurn chuyen luot sang Player2 va nap day AP cho Player2" $ do
      let gs0 = modifyPlayer Player2 (\p -> p { playerAP = 0 }) baseState
          gs = ok (step Player1 EndTurn gs0)
      gsCurrent gs `shouldBe` Player2
      playerAP (getPlayer Player2 gs) `shouldBe` 5
      gsRound gs `shouldBe` 1
    it "het AP thi tu dong doi luot" $ do
      let gs0 = modifyPlayer Player1 (\p -> p { playerAP = 1 }) baseState
          gs = ok (step Player1 (Move DirRight) gs0)
      gsCurrent gs `shouldBe` Player2
    it "con AP thi van la luot cua minh" $
      gsCurrent (ok (step Player1 (Move DirRight) baseState)) `shouldBe` Player1
    it "sau luot Player2 thi sang vong moi va Player1 duoc nap day AP" $ do
      let gs0 = (modifyPlayer Player1 (\p -> p { playerAP = 0 }) baseState) { gsCurrent = Player2 }
          gs = ok (step Player2 EndTurn gs0)
      gsCurrent gs `shouldBe` Player1
      gsRound gs `shouldBe` 2
      playerAP (getPlayer Player1 gs) `shouldBe` 5

  describe "thang bang du diem" $ do
    it "Deposit lam kho Earth dat 500 diem thi thang" $ do
      -- 20 Exotic Matter = 500 diem
      let gs = ok (step Player1 Deposit (carrying (Pos 50 50) (rs [(ExoticMatter, 20)])))
      gsPhase gs `shouldBe` Finished (Winner Player1 ReachedTarget)
    it "chua du diem thi tran tiep tuc" $ do
      let gs = ok (step Player1 Deposit (carrying (Pos 50 50) (rs [(ExoticMatter, 19)])))
      gsPhase gs `shouldBe` InProgress
    it "thang truoc thua: dat 500 diem cung luc battery ve 0 thi van thang" $ do
      let gs0 = modifyPlayer Player1 (\p -> p { playerBattery = 2 }) (carrying (Pos 52 50) (rs [(ExoticMatter, 20)]))
          gs = ok (step Player1 Deposit gs0)
      playerBattery (getPlayer Player1 gs) `shouldBe` 0
      gsPhase gs `shouldBe` Finished (Winner Player1 ReachedTarget)
    it "diem tich luy tu cac lan Deposit truoc cung duoc tinh" $ do
      let gs0 = modifyPlayer Player1 (\p -> p { playerStorage = rs [(ExoticMatter, 19)] })
                  (carrying (Pos 50 50) (rs [(Iron, 25)]))
          gs = ok (step Player1 Deposit gs0)
      gsPhase gs `shouldBe` Finished (Winner Player1 ReachedTarget)

  describe "thua do het battery" $ do
    it "battery ve 0 thi doi thu thang" $ do
      let gs0 = modifyPlayer Player1 (\p -> p { playerBattery = 2 }) baseState
          gs = ok (step Player1 (Move DirRight) gs0)
      gsPhase gs `shouldBe` Finished (Winner Player2 OpponentOutOfBattery)
    it "battery con 1 sau action thi tran tiep tuc" $ do
      let gs0 = modifyPlayer Player1 (\p -> p { playerBattery = 3 }) baseState
      gsPhase (ok (step Player1 (Move DirRight) gs0)) `shouldBe` InProgress
    it "sau khi ket thuc khong lam them duoc gi" $ do
      let gs0 = modifyPlayer Player1 (\p -> p { playerBattery = 2 }) baseState
          gs = ok (step Player1 (Move DirRight) gs0)
      step Player1 EndTurn gs `shouldBe` Left GameNotInProgress

  describe "het so vong" $ do
    let lastRound = baseState { gsRound = 100, gsCurrent = Player2 }
        withScores a b =
          modifyPlayer Player1 (\p -> p { playerStorage = a })
            (modifyPlayer Player2 (\p -> p { playerStorage = b }) lastRound)
    it "het vong 100: diem Earth cao hon thi thang" $ do
      let gs = ok (step Player2 EndTurn (withScores (rs [(Iron, 10)]) (rs [(Iron, 3)])))
      gsPhase gs `shouldBe` Finished (Winner Player1 HigherScoreAtLimit)
    it "Player2 diem cao hon thi Player2 thang" $ do
      let gs = ok (step Player2 EndTurn (withScores Map.empty (rs [(Crystal, 1)])))
      gsPhase gs `shouldBe` Finished (Winner Player2 HigherScoreAtLimit)
    it "bang diem thi hoa" $ do
      let gs = ok (step Player2 EndTurn (withScores (rs [(Iron, 4)]) (rs [(Iron, 4)])))
      gsPhase gs `shouldBe` Finished Draw
    it "het luot Player1 o vong 100 thi chua ket thuc" $ do
      let gs = ok (step Player1 EndTurn (baseState { gsRound = 100 }))
      gsPhase gs `shouldBe` InProgress
      gsCurrent gs `shouldBe` Player2

  describe "forfeit" $ do
    it "mot nguoi mat ket noi thi nguoi kia thang" $
      gsPhase (forfeit Player1 baseState) `shouldBe` Finished (Winner Player2 OpponentDisconnected)
    it "tran da ket thuc thi giu nguyen ket qua" $ do
      let done = baseState { gsPhase = Finished (Winner Player1 ReachedTarget) }
      forfeit Player1 done `shouldBe` done

  describe "mo phong nhieu action ngau nhien" $
    modifyMaxSuccess (const 100) $ do
      it "cac bat bien luon dung sau moi action" $ property $
        forAll (vectorOf 80 genAction) $ \actions ->
          all validState (scanl stepAny start actions)
      it "tong tai nguyen duoc bao toan neu khong Recharge" $ property $
        forAll (vectorOf 80 genNoRecharge) $ \actions ->
          totalAll (foldl stepAny start actions) == totalAll start

-- | Tran bat dau cho phan mo phong: Player1 dung tren hanh tinh gan Earth.
start :: GameState
start = modifyPlayer Player1 (\p -> p { playerPos = Pos 53 50 })
    (baseState { gsPlanets = Map.singleton 1 testPlanet { planetPos = Pos 53 50 } })

-- | Lam mot action cho nguoi dang co luot; bi tu choi thi giu nguyen.
stepAny :: GameState -> Action -> GameState
stepAny gs a = either (const gs) id (step (gsCurrent gs) a gs)

genAction :: Gen Action
genAction = frequency
    [ (4, Move <$> elements [minBound .. maxBound])
    , (2, pure Observe)
    , (1, pure ScanArea)
    , (1, pure ScanNearest)
    , (1, pure ScanOpponent)
    , (4, Mine <$> elements [Iron, Crystal])
    , (3, pure Deposit)
    , (1, Recharge <$> elements [Iron, Crystal] <*> choose (1, 5))
    , (2, pure EndTurn)
    ]

genNoRecharge :: Gen Action
genNoRecharge = genAction `suchThat` notRecharge
  where
    notRecharge (Recharge _ _) = False
    notRecharge _              = True

-- | Cac dieu kien phai luon dung o moi trang thai.
validState :: GameState -> Bool
validState gs = all validPlayer [gsPlayer1 gs, gsPlayer2 gs] && all nonNegative stocks
  where
    stocks = map planetStock (Map.elems (gsPlanets gs))
    finished = case gsPhase gs of
        Finished _ -> True
        _          -> False
    validPlayer p =
        playerAP p >= 0 && playerAP p <= 5
        && playerBattery p >= 0 && playerBattery p <= 100
        && (playerBattery p > 0 || finished)
        && totalUnits (playerCargo p) <= 50
        && nonNegative (playerCargo p) && nonNegative (playerStorage p)
        && inBounds cfg (playerPos p)
    nonNegative = all (>= 0) . Map.elems

-- | Tong moi don vi tai nguyen trong tran (hanh tinh, cargo, kho Earth).
totalAll :: GameState -> Int
totalAll gs = sum (map (totalUnits . planetStock) (Map.elems (gsPlanets gs)))
    + sum [ totalUnits (playerCargo p) + totalUnits (playerStorage p) | p <- [gsPlayer1 gs, gsPlayer2 gs] ]