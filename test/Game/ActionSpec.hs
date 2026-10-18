
module Game.ActionSpec (spec) where

import qualified Data.Map.Strict as Map
import Test.Hspec

import Game.Action
import Game.State
import Game.TestUtil
import Game.Types

-- | Chay action cua Player1 tren mot tran cho truoc.
run1 :: Action -> GameState -> Either GameError (GameState, ActionReport)
run1 = performAction cfg Player1

-- | Dat Player1 vao vi tri, va chinh them mot so truong.
at1 :: Pos -> GameState
at1 pos = modifyPlayer Player1 (\p -> p { playerPos = pos }) baseState

p1 :: GameState -> Player
p1 = getPlayer Player1

-- | Lay ket qua chinh (khong quan tam bao cao).
stateOf :: Either GameError (GameState, ActionReport) -> Either GameError GameState
stateOf = fmap fst

resultOf :: Either GameError (GameState, ActionReport) -> Either GameError ActionResult
resultOf = fmap (reportResult . snd)

spec :: Spec
spec = do
  describe "Move" $ do
    it "di 1 o, tru 1 AP va 2 battery" $ do
      let (gs, rep) = ok $ run1 (Move DirRight) baseState
      playerPos (p1 gs) `shouldBe` Pos 51 50
      (playerAP (p1 gs), playerBattery (p1 gs)) `shouldBe` (4, 98)
      reportResult rep `shouldBe` Moved (Pos 51 50)
    it "ra ngoai map bi tu choi" $
      stateOf (run1 (Move DirUp) (at1 (Pos 0 0))) `shouldBe` Left OutOfBounds
    it "het AP bi tu choi" $
      stateOf (run1 (Move DirUp) (modifyPlayer Player1 (\p -> p { playerAP = 0 }) baseState))
        `shouldBe` Left NotEnoughAP
    it "thieu battery bi tu choi" $
      stateOf (run1 (Move DirUp) (modifyPlayer Player1 (\p -> p { playerBattery = 1 }) baseState))
        `shouldBe` Left NotEnoughBattery
    it "buoc len hanh tinh thi tu kham pha" $ do
      let (gs, _) = ok $ run1 (Move DirDown) (at1 (Pos 60 59))
      Map.keys (playerKnown (p1 gs)) `shouldBe` [1]
    it "buoc vao o khong co hanh tinh thi khong kham pha gi" $ do
      let (gs, _) = ok $ run1 (Move DirDown) (at1 (Pos 70 70))
      playerKnown (p1 gs) `shouldBe` Map.empty

  describe "Observe" $ do
    it "thay hanh tinh trong ban kinh 3, tru 1 AP 1 battery" $ do
      let (gs, rep) = ok $ run1 Observe (at1 (Pos 60 57))
      reportResult rep `shouldBe` PlanetsFound [KnownPlanet (Pos 60 60) Mining]
      (playerAP (p1 gs), playerBattery (p1 gs)) `shouldBe` (4, 99)
      Map.keys (playerKnown (p1 gs)) `shouldBe` [1]
    it "hanh tinh cach 4 o thi khong thay" $
      resultOf (run1 Observe (at1 (Pos 60 56))) `shouldBe` Right (PlanetsFound [])

  describe "ScanArea" $ do
    it "thay hanh tinh cach dung 8 o, tru 2 AP 3 battery" $ do
      let (gs, rep) = ok $ run1 ScanArea (at1 (Pos 60 52))
      reportResult rep `shouldBe` PlanetsFound [KnownPlanet (Pos 60 60) Mining]
      (playerAP (p1 gs), playerBattery (p1 gs)) `shouldBe` (3, 97)
    it "cach 9 o thi khong thay" $
      resultOf (run1 ScanArea (at1 (Pos 60 51))) `shouldBe` Right (PlanetsFound [])
    it "khong lo vi tri doi thu" $ do
      let (_, rep) = ok $ run1 ScanArea (at1 (Pos 50 41))
      reportResult rep `shouldBe` PlanetsFound []

  describe "ScanNearest" $ do
    it "tra huong va khoang cach toi hanh tinh gan nhat" $ do
      let (gs, rep) = ok $ run1 ScanNearest baseState
      reportResult rep `shouldBe` NearestPlanet (Just (SouthEast, 20))
      (playerAP (p1 gs), playerBattery (p1 gs)) `shouldBe` (3, 97)
      playerKnown (p1 gs) `shouldBe` Map.empty
    it "hanh tinh da can tai nguyen thi bo qua; het thi tra Nothing va van tru phi" $ do
      let empty = baseState { gsPlanets = Map.singleton 1 testPlanet { planetStock = Map.empty } }
          (gs, rep) = ok $ run1 ScanNearest empty
      reportResult rep `shouldBe` NearestPlanet Nothing
      playerAP (p1 gs) `shouldBe` 3

  describe "ScanOpponent" $ do
    it "tra huong toi doi thu va bao cho doi thu" $ do
      let (gs, rep) = ok $ run1 ScanOpponent baseState
      reportResult rep `shouldBe` OpponentDirection North
      reportNotice rep `shouldBe` Just YouWereScanned
      (playerAP (p1 gs), playerBattery (p1 gs)) `shouldBe` (2, 97)
    it "cung o thi tra Here" $
      resultOf (run1 ScanOpponent (at1 (Pos 50 40))) `shouldBe` Right (OpponentDirection Here)
    it "thieu AP bi tu choi" $
      stateOf (run1 ScanOpponent (modifyPlayer Player1 (\p -> p { playerAP = 2 }) baseState))
        `shouldBe` Left NotEnoughAP

  describe "EndTurn" $
    it "khong doi gi trong Action (viec doi luot la cua Turn)" $ do
      let (gs, rep) = ok $ run1 EndTurn baseState
      gs `shouldBe` baseState
      reportResult rep `shouldBe` TurnEnded

  describe "Mine" $ do
    it "khong dung tren hanh tinh thi bi tu choi" $
      stateOf (run1 (Mine Iron) baseState) `shouldBe` Left NotOnPlanet
    it "lay 5 don vi, tru 2 AP 1 battery, giam ton kho, tu kham pha" $ do
      let (gs, rep) = ok $ run1 (Mine Iron) (at1 (Pos 60 60))
      reportResult rep `shouldBe` Mined Iron 5
      playerCargo (p1 gs) `shouldBe` rs [(Iron, 5)]
      (playerAP (p1 gs), playerBattery (p1 gs)) `shouldBe` (3, 99)
      fmap planetStock (Map.lookup 1 (gsPlanets gs)) `shouldBe` Just (rs [(Iron, 75), (Crystal, 30)])
      Map.keys (playerKnown (p1 gs)) `shouldBe` [1]
    it "chi lay duoc phan con cho trong cargo" $ do
      let full = modifyPlayer Player1 (\p -> p { playerPos = Pos 60 60, playerCargo = rs [(Crystal, 48)] }) baseState
      resultOf (run1 (Mine Iron) full) `shouldBe` Right (Mined Iron 2)
    it "cargo day thi bi tu choi" $ do
      let full = modifyPlayer Player1 (\p -> p { playerPos = Pos 60 60, playerCargo = rs [(Crystal, 50)] }) baseState
      stateOf (run1 (Mine Iron) full) `shouldBe` Left CargoFull
    it "loai khong co tren hanh tinh thi bi tu choi" $
      stateOf (run1 (Mine RareOre) (at1 (Pos 60 60))) `shouldBe` Left PlanetHasNoSuchResource
    it "ton kho it hon 5 thi lay het va bo loai do khoi ton kho" $ do
      let small = (at1 (Pos 60 60)) { gsPlanets = Map.singleton 1 testPlanet { planetStock = rs [(Iron, 3)] } }
          (gs, rep) = ok $ run1 (Mine Iron) small
      reportResult rep `shouldBe` Mined Iron 3
      fmap planetStock (Map.lookup 1 (gsPlanets gs)) `shouldBe` Just Map.empty
    it "thieu AP bi tu choi va khong mat gi" $
      stateOf (run1 (Mine Iron) (modifyPlayer Player1 (\p -> p { playerPos = Pos 60 60, playerAP = 1 }) baseState))
        `shouldBe` Left NotEnoughAP

  describe "Deposit" $ do
    let loaded pos = modifyPlayer Player1 (\p -> p { playerPos = pos, playerCargo = rs [(Iron, 4), (Crystal, 2)] }) baseState
    it "dung tai Earth: tru 1 AP, khong tru battery, cargo vao kho" $ do
      let (gs, rep) = ok $ run1 Deposit (loaded (Pos 50 50))
      playerCargo (p1 gs) `shouldBe` Map.empty
      playerStorage (p1 gs) `shouldBe` rs [(Iron, 4), (Crystal, 2)]
      (playerAP (p1 gs), playerBattery (p1 gs)) `shouldBe` (4, 100)
      reportResult rep `shouldBe` Deposited (rs [(Iron, 4), (Crystal, 2)])
    it "cach Earth 3 o: tru them 2 battery" $ do
      let (gs, _) = ok $ run1 Deposit (loaded (Pos 53 50))
      (playerAP (p1 gs), playerBattery (p1 gs)) `shouldBe` (4, 98)
    it "cach Earth 6 o thi ngoai tam" $
      stateOf (run1 Deposit (loaded (Pos 56 50))) `shouldBe` Left OutOfDepositRange
    it "cargo rong thi bi tu choi" $
      stateOf (run1 Deposit baseState) `shouldBe` Left CargoEmpty
    it "cong don vao kho da co" $ do
      let gs0 = modifyPlayer Player1 (\p -> p { playerStorage = rs [(Iron, 10)] }) (loaded (Pos 50 50))
          (gs, _) = ok $ run1 Deposit gs0
      playerStorage (p1 gs) `shouldBe` rs [(Iron, 14), (Crystal, 2)]

  describe "Recharge" $ do
    let hurt = modifyPlayer Player1 (\p -> p { playerBattery = 50, playerStorage = rs [(Crystal, 10)] }) baseState
    it "doi tai nguyen lay battery: 2 Crystal = 6 diem = 12 battery" $ do
      let (gs, rep) = ok $ run1 (Recharge Crystal 2) hurt
      playerBattery (p1 gs) `shouldBe` 62
      playerStorage (p1 gs) `shouldBe` rs [(Crystal, 8)]
      playerAP (p1 gs) `shouldBe` 4
      reportResult rep `shouldBe` Recharged 12
    it "vuot toi da thi phan du mat nhung van tru tai nguyen" $ do
      let nearly = modifyPlayer Player1 (\p -> p { playerBattery = 98, playerStorage = rs [(Iron, 5)] }) baseState
          (gs, rep) = ok $ run1 (Recharge Iron 5) nearly
      playerBattery (p1 gs) `shouldBe` 100
      playerStorage (p1 gs) `shouldBe` Map.empty
      reportResult rep `shouldBe` Recharged 2
    it "khong o Earth thi bi tu choi" $
      stateOf (run1 (Recharge Crystal 1) (modifyPlayer Player1 (\p -> p { playerPos = Pos 51 50 }) hurt))
        `shouldBe` Left NotAtEarth
    it "battery da day thi bi tu choi" $
      stateOf (run1 (Recharge Crystal 1) (modifyPlayer Player1 (\p -> p { playerBattery = 100 }) hurt))
        `shouldBe` Left BatteryFull
    it "khong du tai nguyen thi bi tu choi" $
      stateOf (run1 (Recharge Crystal 11) hurt) `shouldBe` Left NotEnoughResources
    it "so luong <= 0 thi bi tu choi" $
      stateOf (run1 (Recharge Crystal 0) hurt) `shouldBe` Left InvalidAmount