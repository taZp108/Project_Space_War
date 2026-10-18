import Test.Hspec
import Test.QuickCheck
import Lib (projectName)

import qualified Game.ActionSpec
import qualified Game.GenerateSpec
import qualified Game.StateSpec
import qualified Game.TurnSpec
import qualified Game.WorldSpec

main :: IO ()
main = hspec $ do
  describe "Lib" $
    it "projectName is space-war" $
      projectName `shouldBe` "space-war"
  describe "QuickCheck" $
    it "addition is commutative" $
      property $ \x y -> (x + y) == (y + (x :: Int))
  describe "Game.World" Game.WorldSpec.spec
  describe "Game.Generate" Game.GenerateSpec.spec
  describe "Game.State" Game.StateSpec.spec
  describe "Game.Action" Game.ActionSpec.spec
  describe "Game.Turn" Game.TurnSpec.spec