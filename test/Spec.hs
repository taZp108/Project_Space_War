import Test.Hspec
import Test.QuickCheck
import Lib (projectName)

import qualified Game.GenerateSpec
import qualified Game.WorldSpec
import qualified Game.StateSpec
import qualified Game.OutcomeSpec

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
  describe "Game.Outcome" Game.OutcomeSpec.spec