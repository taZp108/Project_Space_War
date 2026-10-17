module Game.OutcomeSpec (spec) where

import Test.Hspec

import Game.Config
import Game.State
import Game.TestUtil
import Game.Turn
import Game.Types

-- Cho tran gs, dat kho Earth cua nguoi choi thanh danh sach xs và tra ve tran moi
withStorage :: PlayerId -> [(ResourceType, Int)] -> GameState -> GameState
withStorage pid xs = modifyPlayer pid (\p -> p {playerStorage = rs xs})

-- Cho tran gs, dat pin cua nguoi choi pid thanh n va tra ve tran moi
withBattery :: PlayerId -> Int -> GameState -> GameState
withBattery pid n = modifyPlayer pid (\p -> p {playerBattery = n})

spec :: Spec
spec = do
    describe "checkReachedTarget" $ do
        -- Player1 co dung 500 diem trong kho Earth thi ket qua tra ve la Player1 thang
        it "du diem (20 Exotic  = 500) thi thang" $
            checkReachedTarget cfg Player1 (withStorage Player1 [(ExoticMatter, 20)] baseState)
                `shouldBe` Just (Winner Player1 ReachedTarget)

        -- Nguoi choi phai dat dung 500 diem, neu thieu 1 diem van chua tinh la thang
        it "thieu 1 diem (499) thi chua thang" $
            checkReachedTarget cfg Player1
              (withStorage Player1 [(ExoticMatter, 19), (Iron, 24)] baseState)
              `shouldBe` Nothing

        -- Tren tau (cargo) co 40 Exotic nhung kho Earth rong thi van khong tinh diem
        it "cargo khong tinh diem" $ do
            let gs = modifyPlayer Player1 (\p -> p {playerCargo = rs [(ExoticMatter, 40)]}) baseState
            checkReachedTarget cfg Player1 gs `shouldBe` Nothing

        it "doc diem muc tieu tu Config" $
            checkReachedTarget cfg {cfgScoreTarget = 10} Player2
              (withStorage Player2 [(Crystal, 4)] baseState)
              `shouldBe` Just (Winner Player2 ReachedTarget)

    describe "checkBatteryDepleted" $ do
        it "Player1 het pin thi Player2 thang" $
            checkBatteryDepleted Player1 (withBattery Player1 0 baseState)
              `shouldBe` Just (Winner Player2 OpponentOutOfBattery)

        it "Player2 het pin thi Player1 thang" $
            checkBatteryDepleted Player2 (withBattery Player2 0 baseState)
              `shouldBe` Just (Winner Player1 OpponentOutOfBattery)

        it "con 1 pin thi chua thua" $
            checkBatteryDepleted Player1 (withBattery Player1 1 baseState)
            `shouldBe` Nothing

    describe "checkOutcome" $ do
        it "binh thuong thi chua co ket qua" $
            checkOutcome cfg Player1 baseState `shouldBe` Nothing

        it "du diem va het pin cung luc thi thang (thang truoc thua)" $ do
            let gs = withBattery Player1 0
                        (withStorage Player1 [(ExoticMatter, 20)] baseState)
            checkOutcome cfg Player1 gs `shouldBe` Just (Winner Player1 ReachedTarget)

    describe "resolveAtLimit" $ do
        it "Player1 diem cao hon thi thang" $
            resolveAtLimit cfg (withStorage Player1 [(Iron, 5)] baseState)
              `shouldBe` Winner Player1 HigherScoreAtLimit

        it "Player 2 diem cao hon thi thang" $
            resolveAtLimit cfg (withStorage Player2 [(Iron, 5)] baseState)
              `shouldBe` Winner Player2 HigherScoreAtLimit

        it "diem bang nhau thi hoa" $
            resolveAtLimit cfg baseState `shouldBe` Draw

    describe "checkRoundLimit" $ do
        let atRound n = baseState {gsRound = n}
        it "het luot Player2 o vong 100 thi tinh ket qua" $
            checkRoundLimit cfg Player2 (atRound 100) `shouldBe` Just Draw

        it "het luot Player1 o vong 100 thi Player2 van tiep tuc" $
            checkRoundLimit cfg Player1 (atRound 100) `shouldBe` Nothing

        it "vong 99 van tiep tuc" $ 
            checkRoundLimit cfg Player2 (atRound 99) `shouldBe` Nothing

        it "doc so vong toi da tu Config" $ 
            checkRoundLimit cfg {cfgMaxRounds = 3} Player2 (atRound 3) `shouldBe` Just Draw
    
    describe "finishGame" $
        it "dat gsPhase thanh Finished" $
            gsPhase (finishGame Draw baseState) `shouldBe` Finished Draw
