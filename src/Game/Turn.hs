-- | Dieu phoi luot choi: kiem tra phase (kiem tra tran co dang InProgress khong) va luot,
-- ap dung action, doi luot, cap lai AP, tang vong, xu ly mat ket noi,
-- xet thang/thua/hoa.
module Game.Turn
    ( applyAction
    , endTurn
    , forfeit
    , isGameOver
    , checkOutcome
    , roundLimitResult
    ) where

-- import Game.Action (performAction) -- Tam comment vi Action.hs chua co ham nay
import Game.Config
import Game.State
import Game.Types

-- THAO: luot, AP, EndTurn, round, mat ket noi

-- | Ap dung mot action cua nguoi choi @pid@ (ham trung tam cua module nay).
--
-- Thu tu xu ly (khong duoc doi thu tu):
--
-- 1. Tran dau phai dang 'InProgress', neu khong tra ve 'GameNotInProgress'.
--
-- 2. Phai dung luot cua @pid@ (so voi @gsCurrent@), neu khong tra ve 'NotYourTurn'.
--
-- 3. 'EndTurn' khong ton AP/battery, chi doi luot. Xu ly ngay tai day,
--    khong chuyen cho 'performAction'.
--
-- 4. Cac action khac chuyen cho 'performAction' (kiem tra AP, battery va dieu kien
--    rieng cua tung action). Bi tu choi thi tra ve 'Left' va state cu giu nguyen
--    (khong mat AP, khong mat battery).
--
-- 5. Action thanh cong thi chay 'settle' de hau xu ly (co ket qua thi dung,
--    het AP thi tu dong doi luot).
--
-- Khi action lam ket thuc tran, ket qua tra ve van la 'Right'; ben goi doc
-- @gsPhase@ cua state moi de biet tran da xong.
applyAction :: Config -> PlayerId -> Action -> GameState
            -> Either GameError (GameState, ActionReport)
applyAction cfg pid action gs
    | gsPhase gs /= InProgress = Left GameNotInProgress
    | gsCurrent gs /= pid      = Left NotYourTurn
    | action == EndTurn        = Right (endTurn cfg gs, ActionReport TurnEnded Nothing)
    | otherwise =
        -- Tam comment doan duoi lai vi Action.hs chua co ham performAction
        -- case performAction cfg pid action gs of
        --     Left err            -> Left err
        --     Right (gs1, report) -> Right (settle cfg pid gs1, report)
        Left NotEnoughAP -- Tra ve loi tam thoi de build pass

-- | Hau xu ly sau mot action thanh cong (khong phai 'EndTurn').
--
-- * Neu 'checkOutcome' bao da co ket qua thang/thua thi ghi ket qua
--   vao @gsPhase@ va dung ngay, KHONG doi luot (khong co luot cuoi).
--
-- * Neu chua co ket qua ma AP cua @pid@ ve 0 thi tu dong goi 'endTurn'.
--
-- * Con lai giu nguyen state, nguoi choi tiep tuc luot cua minh.
settle :: Config -> PlayerId -> GameState -> GameState
settle cfg pid gs = case checkOutcome cfg pid gs of
    Just result -> gs { gsPhase = Finished result }
    Nothing
        | playerAP (getPlayer pid gs) <= 0 -> endTurn cfg gs
        | otherwise                        -> gs

-- | Ket thuc luot cua nguoi dang di.
--
-- * Player1 xong: sang Player2, giu nguyen round.
--
-- * Player2 xong: ca hai da di het vong hien tai.
--   Neu @gsRound@ da dat 'cfgMaxRounds' thi het tran, ket qua do
--   'roundLimitResult' quyet dinh. Nguoc lai tang round them 1
--   va quay ve Player1.
--
-- Chi sau khi Player2 xong o vong cuoi moi het tran. Player1 xong o vong cuoi
-- thi van phai chuyen cho Player2 di not.
--
-- Khong lam gi neu tran khong con 'InProgress'.
endTurn :: Config -> GameState -> GameState
endTurn cfg gs
    | gsPhase gs /= InProgress = gs
    | otherwise = case gsCurrent gs of
        Player1 -> startTurn cfg Player2 gs
        Player2
            | gsRound gs >= cfgMaxRounds cfg ->
                gs { gsPhase = Finished (roundLimitResult cfg gs) }
            | otherwise ->
                startTurn cfg Player1 gs { gsRound = gsRound gs + 1 }

-- | Trao luot cho nguoi choi @pid@ va __cap lai AP__ (Action Points) ve day du.
--
-- __AP la gi?__
-- AP la ngan sach hanh dong cua moi nguoi choi trong mot luot. Moi action
-- (Move, Observe, Mine, ...) ton mot so AP nhat dinh theo 'Config'.
-- Khi AP ve 0, nguoi choi het quyen hanh dong trong luot do.
--
-- __Cap lai AP nghia la gi?__
-- Moi khi bat dau luot moi, AP cua nguoi do duoc reset ve gia tri toi da
-- ('cfgApMax'). Neu khong cap lai, nguoi choi se vao luot voi 0 AP va khong lam
-- duoc gi. Chi cap lai cho nguoi SAP DI, khong dong vao AP cua nguoi vua xong.
--
-- __Khi nao ham nay duoc goi?__
-- Day la ham noi bo, chi 'endTurn' goi:
--
-- * Player1 ket thuc luot: @startTurn cfg Player2 gs@
--
-- * Player2 ket thuc luot va chua het so vong: @startTurn cfg Player1 gs { gsRound = ... }@
--
-- __Vi du mot luot (cfgApMax = 5, moi Move ton 1 AP):__
--
-- @
-- Player1 bat dau luot, AP = 5
--     Move  => AP = 4
--     Move  => AP = 3
--     ...
--     Move  => AP = 0, settle tu dong goi endTurn
-- Player2 bat dau luot, AP = 5 (cap lai day du)
-- @
startTurn :: Config -> PlayerId -> GameState -> GameState
startTurn cfg pid gs =
    (modifyPlayer pid (\p -> p { playerAP = cfgApMax cfg }) gs)
        { gsCurrent = pid }

-- | Nguoi choi @pid@ mat ket noi giua tran: doi thu thang ngay
-- ('OpponentDisconnected'). Khong co ket noi lai.
--
-- Chi co tac dung khi tran dang 'InProgress'. Tran da ket thuc (hoac chua bat dau)
-- thi giu nguyen, khong ghi de ket qua cu.
forfeit :: PlayerId -> GameState -> GameState
forfeit pid gs = case gsPhase gs of
    InProgress ->
        gs { gsPhase = Finished (Winner (otherPlayer pid) OpponentDisconnected) }
    _ -> gs

-- | Tran da ket thuc chua (phase la 'Finished' bat ke ket qua).
-- Dung cho buoc tich hop cua Khoa de kiem tra truoc khi nhan them action.
isGameOver :: GameState -> Bool
isGameOver gs = case gsPhase gs of
    Finished _ -> True
    _          -> False

-- THUONG: thang / thua / het vong
-- Thuong chi sua trong khoi nay. Giu nguyen chu ky ham de
-- khoi 1 cua Thao khong phai doi.

-- | Kiem tra ket qua sau action cua @pid@, THANG TRUOC THUA:
--
-- 1. Diem kho Earth cua @pid@ dat 'cfgScoreTarget' (lay tu Config, khong ghi
--    cung so 500) thi @pid@ thang ('ReachedTarget'). Kiem tra truoc tien de
--    truong hop Deposit tu xa lam battery ve 0 nhung dong thoi du diem van thang.
--
-- 2. Neu chua thang, battery cua @pid@ ve 0 hoac am thi @pid@ thua ngay,
--    doi thu thang ('OpponentOutOfBattery'). Khong co luot cuoi.
--
-- 3. Con lai tra ve 'Nothing' (tran tiep tuc).
--
-- Chi xet nguoi vua hanh dong, vi chi action cua ho moi lam doi diem/battery cua ho.
checkOutcome :: Config -> PlayerId -> GameState -> Maybe GameResult
checkOutcome cfg pid gs
    | playerScore cfg me >= cfgScoreTarget cfg =
        Just (Winner pid ReachedTarget)
    | playerBattery me <= 0 =
        Just (Winner (otherPlayer pid) OpponentOutOfBattery)
    | otherwise = Nothing
  where
    me = getPlayer pid gs

-- | Ket qua khi het so vong toi da: so diem kho Earth cua hai nguoi,
-- ai cao hon thang ('HigherScoreAtLimit'), bang nhau thi hoa ('Draw').
roundLimitResult :: Config -> GameState -> GameResult
roundLimitResult cfg gs
    | s1 > s2   = Winner Player1 HigherScoreAtLimit
    | s2 > s1   = Winner Player2 HigherScoreAtLimit
    | otherwise = Draw
  where
    s1 = playerScore cfg (gsPlayer1 gs)
    s2 = playerScore cfg (gsPlayer2 gs)