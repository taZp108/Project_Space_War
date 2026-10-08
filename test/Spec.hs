import Test.Hspec
import Test.QuickCheck
import Lib (projectName)

main :: IO ()
main = hspec $ do
  describe "Lib" $
    it "projectName is space-war" $
      projectName `shouldBe` "space-war"
  describe "QuickCheck" $
    it "addition is commutative" $
      property $ \x y -> (x + y) == (y + (x :: Int))
