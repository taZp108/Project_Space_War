module Game.RoguelikeSpec (spec) where

import qualified Data.Map.Strict as Map
import qualified Data.ByteString.Lazy.Char8 as BL8
import Data.List (find)
import System.Random (mkStdGen)
import Test.Hspec
import Game.Turn (applyAction)

import Game.Action (performAction)
import Game.Config
import Game.State
import Game.TestUtil
import Game.Types
import Protocol.Json (decodeClientMsg)
import Protocol.Message (ClientMsg (..))

spec :: Spec
spec = do
  it "defines eight resources with configured rarity and value" $ do
    length ([minBound .. maxBound] :: [ResourceType]) `shouldBe` 8
    Map.lookup PinkDiamond (cfgResourceRarity cfg) `shouldBe` Just 1
    Map.lookup PinkDiamond (cfgResourceValue cfg) `shouldBe` Just 50
    Map.lookup Amethyst (cfgResourceRarity cfg) `shouldBe` Just 8
    Map.lookup Amethyst (cfgResourceValue cfg) `shouldBe` Just 2
  it "moves multiple Manhattan steps and charges per step" $ do
    let (gs, rep) = ok $ performAction cfg Player1 (MoveTo (Pos 53 50)) baseState
        p = getPlayer Player1 gs
    reportResult rep `shouldBe` Moved (Pos 53 50)
    playerAP p `shouldBe` 2
    playerBattery p `shouldBe` 94
  it "doubles move battery cost during reverse gravity" $ do
    let state = baseState { gsActiveCanonEvent = Just CE_ReverseGravity }
        (gs, _) = ok $ performAction cfg Player1 (MoveTo (Pos 53 50)) state
    playerBattery (getPlayer Player1 gs) `shouldBe` 88
  it "crafts a passive and immediately raises cargo capacity" $ do
    let stocked = modifyPlayer Player1 (\player -> player { playerCargo = rs [(HollyBlueAgate,5),(Spinel,5)] }) baseState
        (gs, _) = ok $ performAction cfg Player1 (Craft IT_CargoUp) stocked
        p = getPlayer Player1 gs
    playerMaxCargo cfg p `shouldBe` cfgCargoCapacity cfg + 20
    invPassives (playerInventory p) `shouldBe` Map.singleton IT_CargoUp 1
    playerCargo p `shouldBe` Map.empty
  it "uses a crafted teleport active item" $ do
    let stocked = modifyPlayer Player1 (\player -> player { playerPos = Pos 60 60, playerInventory = Inventory Map.empty [IT_Teleport] }) baseState
        (gs, _) = ok $ performAction cfg Player1 (UseItem IT_Teleport) stocked
        p = getPlayer Player1 gs
    playerPos p `shouldBe` gsEarth gs
    invActives (playerInventory p) `shouldBe` []
  it "randomly mines a resource from the planet and triggers a planet only once" $ do
    let candidate seed =
          let start = modifyPlayer Player1 (\player -> player { playerPos = Pos 60 60 }) (baseState { gsRng = mkStdGen seed })
              (gs, rep) = ok $ performAction cfg Player1 MineRandom start
          in (gs, rep)
        triggered = find (hasPlanetEvent . reportResult . snd) [candidate seed | seed <- [1..500]]
    (gs, rep) <- requireFirst "Expected a planet event within the deterministic seed range." triggered
    let p = getPlayer Player1 gs
    totalUnits (playerCargo p) `shouldSatisfy` (> 0)
    hasPlanetEvent (reportResult rep) `shouldBe` True
    maybe False planetEventTriggered (Map.lookup 1 (gsPlanets gs)) `shouldBe` True
    let planet = maybe testPlanet id (Map.lookup 1 (gsPlanets gs))
        refilled = gs { gsPlanets = Map.insert 1 (planet { planetStock = rs [(Spinel, 80)] }) (gsPlanets gs) }
        (_, secondReport) = ok $ performAction cfg Player1 MineRandom refilled
    hasPlanetEvent (reportResult secondReport) `shouldBe` False
  it "accepts coordinate target and craft actions over the wire" $ do
    decodeClientMsg (BL8.pack "{\"type\":\"action\",\"action\":{\"type\":\"move\",\"target\":{\"x\":53,\"y\":50}}}")
      `shouldBe` Right (DoAction (MoveTo (Pos 53 50)))
    decodeClientMsg (BL8.pack "{\"type\":\"action\",\"action\":{\"type\":\"craft\",\"item\":\"it_teleport\"}}")
      `shouldBe` Right (DoAction (Craft IT_Teleport))
  it "rolls a canonical event at the start of a new round" $ do
    let outcomes = [applyAction cfg Player2 EndTurn (baseState { gsCurrent = Player2, gsRng = mkStdGen seed }) | seed <- [1..300]]
        triggered = find (either (const False) (hasCanonEvent . reportResult . snd)) outcomes
    Right (gs, rep) <- requireFirst "Expected a canon event within the deterministic seed range." triggered
    gsRound gs `shouldBe` 2
    hasCanonEvent (reportResult rep) `shouldBe` True
  it "converts canonical tax into cargo and removes ten percent of score" $ do
    let taxed seed = applyAction cfg Player2 EndTurn
          (modifyPlayer Player1 (\player -> player { playerStorage = rs [(Spinel,100)] })
            (baseState { gsCurrent = Player2, gsRng = mkStdGen seed }))
        result = find (either (const False) (isTax . reportResult . snd)) [taxed seed | seed <- [1..1000]]
    Right (gs, _) <- requireFirst "Expected the canonical tax event within the deterministic seed range." result
    playerScore cfg (getPlayer Player1 gs) `shouldBe` 90
    Map.lookup Spinel (playerCargo (getPlayer Player1 gs)) `shouldBe` Just 10

hasPlanetEvent :: ActionResult -> Bool
hasPlanetEvent (PlanetEventOccurred _ _ _) = True
hasPlanetEvent _ = False

hasCanonEvent :: ActionResult -> Bool
hasCanonEvent (CanonEventOccurred _ _) = True
hasCanonEvent _ = False

isTax :: ActionResult -> Bool
isTax (CanonEventOccurred CE_Tax _) = True
isTax _ = False

requireFirst :: String -> Maybe a -> IO a
requireFirst _ (Just value) = pure value
requireFirst message Nothing = expectationFailure message >> fail message
