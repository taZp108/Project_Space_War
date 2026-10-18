-- | Luot choi: ap dung action cua mot nguoi, doi luot, kiem tra thang/thua.
module Game.Turn
    ( applyAction
    , endTurn
    , forfeit
    ) where

import Game.Action
import Game.Config
import Game.State
import Game.Types

-- | Ap dung mot action cua nguoi choi. Kiem tra tran dang choi va dung luot,
-- roi thuc hien action, roi xu ly ket qua (thang, thua, het AP thi doi luot).
applyAction
    :: Config -> PlayerId -> Action -> GameState
    -> Either GameError (GameState, ActionReport)
applyAction cfg pid action gs
    | gsPhase gs /= InProgress = Left GameNotInProgress
    | gsCurrent gs /= pid      = Left NotYourTurn
    | otherwise = do
        (gs', rep) <- performAction cfg pid action gs
        Right (afterAction cfg pid action gs', rep)

-- | Sau moi action thanh cong, thu tu kiem tra la: thang (sau Deposit),
-- thua do het battery, roi het AP hoac EndTurn thi doi luot.
afterAction :: Config -> PlayerId -> Action -> GameState -> GameState
afterAction cfg pid action gs
    | action == Deposit && playerScore cfg me >= cfgScoreTarget cfg =
        finish (Winner pid ReachedTarget) gs
    | playerBattery me <= 0 =
        finish (Winner (otherPlayer pid) OpponentOutOfBattery) gs
    | action == EndTurn || playerAP me <= 0 = endTurn cfg gs
    | otherwise = gs
  where
    me = getPlayer pid gs

-- | Ket thuc luot hien tai. Sau luot cua Player2 thi sang vong moi, neu da het
-- so vong thi tinh ket qua theo diem kho Earth. Nguoi den luot duoc nap day AP.
endTurn :: Config -> GameState -> GameState
endTurn cfg gs = case gsCurrent gs of
    Player1 -> startTurn cfg Player2 gs
    Player2
        | gsRound gs >= cfgMaxRounds cfg -> finish (roundLimitResult cfg gs) gs
        | otherwise -> startTurn cfg Player1 (gs { gsRound = gsRound gs + 1 })

-- | Bat dau luot cua mot nguoi: dat nguoi do lam nguoi hien tai, AP day.
startTurn :: Config -> PlayerId -> GameState -> GameState
startTurn cfg pid gs =
    modifyPlayer pid (\p -> p { playerAP = cfgApMax cfg }) (gs { gsCurrent = pid })

-- | Ket qua khi het so vong: diem Earth cao hon thang, bang nhau thi hoa.
roundLimitResult :: Config -> GameState -> GameResult
roundLimitResult cfg gs =
    case compare (playerScore cfg (gsPlayer1 gs)) (playerScore cfg (gsPlayer2 gs)) of
        GT -> Winner Player1 HigherScoreAtLimit
        LT -> Winner Player2 HigherScoreAtLimit
        EQ -> Draw

-- | Nguoi choi mat ket noi thi doi thu thang. Tran da ket thuc thi giu nguyen.
forfeit :: PlayerId -> GameState -> GameState
forfeit loser gs = case gsPhase gs of
    Finished _ -> gs
    _          -> finish (Winner (otherPlayer loser) OpponentDisconnected) gs

finish :: GameResult -> GameState -> GameState
finish result gs = gs { gsPhase = Finished result }