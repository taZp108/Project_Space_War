module Game.GenerateSpec (spec) where

import qualified Data.Map.Strict as Map
import Data.List (nub)
import System.Random (mkStdGen)
import Test.Hspec
import Test.Hspec.QuickCheck (modifyMaxSuccess)
import Test.QuickCheck

import Game.Config
import Game.Generate
import Game.Types
import Game.World

spec :: Spec
spec = do
  let cfg = defaultConfig
      earth = earthPosition cfg
      planetsOf = Map.elems . gsPlanets

  describe "earthPosition" $
    it "mac dinh la (50, 50)" $
      earth `shouldBe` Pos 50 50

  describe "newGame (vi du cu the)" $ do
    let gs = newGame cfg 42
    it "co dung 80 hanh tinh" $
      Map.size (gsPlanets gs) `shouldBe` 160
    it "so hanh tinh tung loai la 40 / 24 / 16" $ do
      let count t = length (filter ((== t) . planetType) (planetsOf gs))
      (count Mining, count Energy, count Rare) `shouldBe` (80, 50, 30)
    it "ton kho moi hanh tinh dung theo loai" $
      all (\p -> planetStock p == (cfgPlanetStock cfg Map.! planetType p)) (planetsOf gs)
        `shouldBe` True
    it "bat dau o vong 1, Player1 di truoc, tran dang choi" $ do
      gsRound gs `shouldBe` 1
      gsCurrent gs `shouldBe` Player1
      gsPhase gs `shouldBe` InProgress
    it "moi nguoi bat dau voi battery va AP day, kho trong" $
      mapM_ (\p -> do
                playerBattery p `shouldBe` 100
                playerAP p `shouldBe` 5
                playerCargo p `shouldBe` Map.empty
                playerStorage p `shouldBe` Map.empty
                playerKnown p `shouldBe` Map.empty)
            [gsPlayer1 gs, gsPlayer2 gs]
    it "cung seed thi ra cung ket qua" $
      newGame cfg 42 `shouldBe` newGame cfg 42
    it "khac seed thi ra map khac" $
      gsPlanets (newGame cfg 1) `shouldNotBe` gsPlanets (newGame cfg 2)

  describe "newGame (tinh chat voi nhieu seed)" $
    modifyMaxSuccess (const 50) $ do
      it "cac hanh tinh nam o cac o khac nhau" $ property $ \seed ->
        let ps = map planetPos (planetsOf (newGame cfg seed))
        in length (nub ps) == length ps
      it "hanh tinh trong map, khong tren Earth, cach Earth >= 4" $ property $ \seed ->
        all (\p -> inBounds cfg (planetPos p)
                   && distance (planetPos p) earth >= cfgPlanetMinEarthDist cfg)
            (planetsOf (newGame cfg seed))
      it "hai nguoi xuat phat cach Earth tu 1 den 5 o" $ property $ \seed ->
        let gs = newGame cfg seed
            ok p = let d = distance (playerPos p) earth in d >= 1 && d <= 5
        in ok (gsPlayer1 gs) && ok (gsPlayer2 gs)
      it "id hanh tinh la 1..80" $ property $ \seed ->
        Map.keys (gsPlanets (newGame cfg seed)) == [1 .. 160]

  describe "pickDistinct" $ do
    it "boc k phan tu khong lap tu danh sach" $ property $ \seed ->
      let (xs, _) = pickDistinct 5 [1 .. 20 :: Int] (mkStdGen seed)
      in length xs == 5 && length (nub xs) == 5
    it "k lon hon do dai thi tra ve toan bo (hoan vi)" $ property $ \seed ->
      let (xs, _) = pickDistinct 10 [1 .. 4 :: Int] (mkStdGen seed)
      in length xs == 4 && sum xs == 10