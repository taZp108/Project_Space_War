-- ======================================================================================================================
--Luat thang, thua và hoa
module Game.Turn where

import Game.Config
import Game.State
import Game.Types

-- Kiem tra xem nguoi choi du diem de thang chua
checkReachedTarget :: Config -> PlayerId -> GameState -> Maybe GameResult
checkReachedTarget cfg pid gs
    | playerScore cfg (getPlayer pid gs) >= cfgScoreTarget cfg = 
        Just (Winner pid ReachedTarget)
    | otherwise = Nothing

-- Kiem tra xem ngươi choi het pin chua, neu het thi thua
checkBatteryDepleted :: PlayerId -> GameState -> Maybe GameResult
checkBatteryDepleted pid gs
    | playerBattery (getPlayer pid gs) <= 0 =
        Just (Winner (otherPlayer pid) OpponentOutOfBattery)
    | otherwise = Nothing

-- Gop 2 ham tren để cho ra ket qua cuoi cung
checkOutcome :: Config -> PlayerId -> GameState -> Maybe GameResult
checkOutcome cfg pid gs = 
    case checkReachedTarget cfg pid gs of
        Just r -> Just r
        Nothing -> checkBatteryDepleted pid gs
    
-- Kiem tra xem sau khi het vong thi nguoi choi nao cao diem hon
resolveAtLimit :: Config -> GameState -> GameResult
resolveAtLimit cfg gs = 
    case compare s1 s2 of 
    -- s1, s2 la diem cua nguoi choi 1 và 2
        --so sanh s1 > s2 thì Player 1 thang
        GT -> Winner Player1 HigherScoreAtLimit  
        
        --so sanh s1 < s2 thi Player 2 thang 
        LT -> Winner Player2 HigherScoreAtLimit
        
        --so sanh s1 = s2 thi hai nguoi hoa nhau
        EQ -> Draw
    where
    s1 = playerScore cfg (gsPlayer1 gs)
    s2 = playerScore cfg (gsPlayer2 gs)

-- Kiem tra xem nguoi choi da choi het 100 vong hay chua
-- 1 vong là 1 luot cua nguoi choi và 100 vong chi that su xong sau khi Player2 choi xong
checkRoundLimit :: Config -> PlayerId -> GameState -> Maybe GameResult
checkRoundLimit cfg pid gs
    | pid == Player2 && gsRound gs >= cfgMaxRounds cfg = 
        Just (resolveAtLimit cfg gs)
    | otherwise = Nothing

-- Ghi ket qua vao trang thai: van game ket thuc, chuyen sang 'Finished'
finishGame :: GameResult -> GameState -> GameState
finishGame result gs = gs {gsPhase = Finished result}

