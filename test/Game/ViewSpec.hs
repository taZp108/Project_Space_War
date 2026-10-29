module Game.ViewSpec (spec) where

import qualified Data.Map.Strict as Map
import Test.Hspec
import Test.Hspec.QuickCheck (modifyMaxSuccess)
import Test.QuickCheck

import Game.Action
import Game.State
import Game.TestUtil
import Game.Types
import Game.View

view1 :: GameState -> PlayerView
view1 = viewFor cfg Player1

view2 :: GameState -> PlayerView
view2 = viewFor cfg Player2

spec :: Spec
spec = do
  describe "viewFor: thong tin cua chinh minh" $ do
    it "Player1 thay trang thai cua minh va thong tin chung" $ do
      let v = view1 baseState
      viewSelf v `shouldBe` Player1
      viewPos v `shouldBe` Pos 50 50
      (viewBattery v, viewBatteryMax v) `shouldBe` (100, 100)
      (viewAP v, viewApMax v) `shouldBe` (5, 5)
      viewCargoCapacity v `shouldBe` 50
      viewEarth v `shouldBe` Pos 50 50
      (viewMapWidth v, viewMapHeight v) `shouldBe` (100, 100)
      (viewRound v, viewMaxRounds v) `shouldBe` (1, 100)
      viewCurrent v `shouldBe` Player1
      viewPhase v `shouldBe` InProgress
      (viewScore v, viewScoreTarget v) `shouldBe` (0, 500)
    it "Player2 thay trang thai cua chinh Player2" $ do
      let v = view2 baseState
      viewSelf v `shouldBe` Player2
      viewPos v `shouldBe` Pos 50 40
      viewCurrent v `shouldBe` Player1
    it "diem chi tinh kho Earth, khong tinh cargo" $ do
      let gs = modifyPlayer Player1
                 (\p -> p { playerCargo = rs [(ExoticMatter, 10)], playerStorage = rs [(Crystal, 2)] })
                 baseState
          v = view1 gs
      viewScore v `shouldBe` 6
      viewCargo v `shouldBe` rs [(ExoticMatter, 10)]
      viewStorage v `shouldBe` rs [(Crystal, 2)]
    it "tran ket thuc thi view cho biet ket qua" $ do
      let done = Finished (Winner Player1 ReachedTarget)
      viewPhase (view1 (baseState { gsPhase = done })) `shouldBe` done

  describe "viewFor: khong lo thong tin cua doi thu" $
    modifyMaxSuccess (const 100) $ do
      it "view cua Player1 khong doi khi trang thai Player2 thay doi" $ property $
        forAll (choose (0, 99)) $ \x -> forAll (choose (0, 99)) $ \y ->
        forAll (choose (1, 100)) $ \b -> forAll (choose (0, 5)) $ \ap ->
        forAll (choose (0, 50)) $ \n ->
          let change p = p { playerPos = Pos x y, playerBattery = b, playerAP = ap
                           , playerCargo = rs [(Iron, n)], playerStorage = rs [(ExoticMatter, n)] }
          in view1 (modifyPlayer Player2 change baseState) == view1 baseState
      it "view cua Player2 khong doi khi trang thai Player1 thay doi" $ property $
        forAll (choose (0, 99)) $ \x -> forAll (choose (0, 99)) $ \y ->
        forAll (choose (0, 50)) $ \n ->
          let change p = p { playerPos = Pos x y, playerCargo = rs [(Crystal, n)], playerStorage = rs [(RareOre, n)] }
          in view2 (modifyPlayer Player1 change baseState) == view2 baseState

  describe "viewFor: hanh tinh" $ do
    it "hanh tinh chua kham pha khong xuat hien" $ do
      let v = view1 baseState
      viewKnown v `shouldBe` Map.empty
      viewHere v `shouldBe` Nothing
    it "ton kho hanh tinh chua kham pha doi thi view khong doi" $ do
      let changed = baseState { gsPlanets = Map.singleton 1 testPlanet { planetStock = rs [(Iron, 1)] } }
      view1 changed `shouldBe` view1 baseState
    it "dung tren hanh tinh thi thay ca ton kho" $ do
      let gs = modifyPlayer Player1 (\p -> p { playerPos = Pos 60 60 }) baseState
      viewHere (view1 gs) `shouldBe` Just testPlanet
    it "sau Observe thi hanh tinh vao danh sach da kham pha, khong kem ton kho" $ do
      let gs0 = modifyPlayer Player1 (\p -> p { playerPos = Pos 60 57 }) baseState
          (gs, _) = ok (performAction cfg Player1 Observe gs0)
      viewKnown (view1 gs) `shouldBe` Map.singleton 1 (KnownPlanet (Pos 60 60) Mining)
      viewHere (view1 gs) `shouldBe` Nothing

  describe "summaryOf" $
    it "lo vi tri va diem cuoi cua ca hai ben" $ do
      let gs = modifyPlayer Player1 (\p -> p { playerStorage = rs [(Crystal, 4)] })
                 (modifyPlayer Player2 (\p -> p { playerStorage = rs [(Iron, 7)] }) baseState)
      summaryOf cfg gs `shouldBe`
        GameSummary (PlayerFinal (Pos 50 50) 12) (PlayerFinal (Pos 50 40) 7)