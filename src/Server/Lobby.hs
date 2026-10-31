{-# LANGUAGE OverloadedStrings #-}
module Server.Lobby
    ( handleJoin
    , handleAction
    , handleDisconnect
    , handlePickAugment
    , pushMsg
    ) where

import Control.Concurrent.STM (TChan, writeTChan, atomically)
import Data.Time.Clock.POSIX (getPOSIXTime)
import qualified Data.Map.Strict as Map

import Game.Config
import Game.Generate (newGame)
import Game.State (otherPlayer, getPlayer, setPlayer)
import Game.Turn (applyAction, forfeit, startTurn)
import Game.Types
import Game.View (PlayerView (..), viewFor, summaryOf)
import Protocol.Message
import Server.Types
-- | Đẩy tin nhắn vào TChan của client (dùng STM).
pushMsg :: TChan ServerMsg -> ServerMsg -> IO ()
pushMsg chan msg = atomically $ writeTChan chan msg

pushTimedView :: TChan ServerMsg -> (PlayerView -> ServerMsg) -> PlayerView -> Maybe Integer -> IO ()
pushTimedView chan wrap view fixedDeadline = do
    deadline <- maybe (floor . (+ 90) <$> getPOSIXTime) pure fixedDeadline
    pushMsg chan (wrap (view { viewTurnEndTime = Just deadline }))

-- | Xử lý khi có người chơi gửi lệnh Join.
handleJoin :: Config -> Client -> Int -> ServerState -> (ServerState, Either String PlayerId, [IO ()])
handleJoin cfg client seed state = case state of
    Empty ->
        ( Waiting client
        , Right Player1
        , [ pushMsg (clientChan client) (Welcome Player1)
          , pushMsg (clientChan client) WaitingForOpponent
          ]
        )
    Waiting client1 ->
        let gs = newGame cfg seed
            view1 = viewFor cfg Player1 gs
            view2 = viewFor cfg Player2 gs
            augmentMsgs = case gsPendingAugments gs of
                Just offers ->
                    [ pushMsg (clientChan client1) (AugmentOfferMsg offers 0)
                    , pushMsg (clientChan client) (AugmentOfferMsg offers 0)
                    ]
                Nothing -> []
        in ( Playing gs client1 client Nothing Nothing
           , Right Player2
           , [ pushMsg (clientChan client) (Welcome Player2)
             , pushTimedView (clientChan client1) GameStarted view1 Nothing
             , pushTimedView (clientChan client) GameStarted view2 Nothing
             ] ++ augmentMsgs
           )
    Playing _ _ _ _ _ ->
        ( state
        , Left "Server is full"
        , [ pushMsg (clientChan client) (ProtocolError "Server is full") ]
        )

-- | Xử lý khi client gửi Action.
-- | Xử lý khi client gửi Action (chỉ khi không có Augment pending).
handleAction :: Config -> PlayerId -> Action -> ServerState -> (ServerState, [IO ()])
handleAction cfg pid action state = case state of
    Playing gs c1 c2 timer aTimer ->
        case gsPendingAugments gs of
            Just _ ->
                let targetClient = if pid == Player1 then c1 else c2
                in ( state, [ pushMsg (clientChan targetClient) (ActionRejected GameNotInProgress) ] )
            Nothing ->
                case applyAction cfg pid action gs of
                    Left err ->
                        let targetClient = if pid == Player1 then c1 else c2
                        in ( state
                           , [ pushMsg (clientChan targetClient) (ActionRejected err) ]
                           )
                    Right (gs', report) ->
                        let targetClient = if pid == Player1 then c1 else c2
                            opponentClient = if pid == Player1 then c2 else c1
                            opponentPid = otherPlayer pid
                            sameTurn = gsRound gs == gsRound gs' && gsCurrent gs == gsCurrent gs'
                            deadline = if sameTurn then turnTimerDeadline <$> timer else Nothing
                            baseMsgs = [ pushTimedView (clientChan targetClient) (ActionAccepted report) (viewFor cfg pid gs') deadline
                                       , pushTimedView (clientChan opponentClient) (OpponentActed (reportNotice report)) (viewFor cfg opponentPid gs') deadline
                                       ] ++ eventMessages cfg report pid c1 c2 gs' deadline
                        in case gsPhase gs' of
                            Finished result ->
                                let summary = summaryOf cfg gs'
                                    gameOver = GameOver result summary
                                    finalMsgs = baseMsgs ++ [ pushMsg (clientChan c1) gameOver
                                                            , pushMsg (clientChan c2) gameOver ]
                                in ( Empty, finalMsgs )
                            _ ->
                                case gsPendingAugments gs' of
                                    Just offers ->
                                        let offerMsg = AugmentOfferMsg offers 0 -- Deadline 0, Handler tự set
                                        in ( Playing gs' c1 c2 timer Nothing
                                           , baseMsgs ++ [ pushMsg (clientChan c1) offerMsg
                                                         , pushMsg (clientChan c2) offerMsg
                                                         ]
                                           )
                                    Nothing ->
                                        ( Playing gs' c1 c2 timer aTimer, baseMsgs )
    _ -> (state, [])

-- | Xử lý khi client ngắt kết nối.
handleDisconnect :: Config -> PlayerId -> ServerState -> (ServerState, [IO ()])
handleDisconnect cfg pid state = case state of
    Waiting _ -> (Empty, [])
    Playing gs c1 c2 _ _ ->
        let gs' = forfeit pid gs
            opponentClient = if pid == Player1 then c2 else c1
            summary = summaryOf cfg gs'
            result = case gsPhase gs' of
                Finished r -> r
                _ -> Draw
            gameOver = GameOver result summary
        in ( Empty
           , [ pushMsg (clientChan opponentClient) gameOver ]
           )
    _ -> (state, [])

eventMessages :: Config -> ActionReport -> PlayerId -> Client -> Client -> GameState -> Maybe Integer -> [IO ()]
eventMessages cfg rep actor c1 c2 gs deadline = case notification (reportResult rep) of
    Nothing -> []
    Just (notice, everyone) ->
        let recipients = if everyone then [(Player1,c1),(Player2,c2)] else [(actor, if actor == Player1 then c1 else c2)]
        in [pushTimedView (clientChan client) (EventTriggered notice) (viewFor cfg pid gs) deadline | (pid,client) <- recipients]
  where
    notification (PlanetEventOccurred ev _ _) = Just (planetNotice ev, False)
    notification (CanonEventOccurred ev _) = Just (canonNotice ev, True)
    notification _ = Nothing
    planetNotice ev = EventNotification (show ev) (case ev of
        EV_LavaCore -> "Pin được nạp đầy; kho hành tinh bị xóa."
        EV_Radiation -> "Bị trừ 20 pin và nhận vật phẩm chủ động."
        EV_GreedyPlanet -> "Thu hoạch giảm một nửa."
        EV_SpaceAnchor -> "Bị kết thúc lượt ngay lập tức."
        EV_Parasite -> "Nhận Pink Diamond; giảm một ô vật phẩm chủ động."
        EV_Mirage -> "Phát hiện thêm hành tinh quanh vị trí hiện tại."
        EV_CargoJam -> "Khoang hàng bị kẹt, giảm 5-10 dung tích."
        EV_Surge -> "Pin được nạp thêm 10.") "planet"
    canonNotice ev = EventNotification (show ev) (case ev of
        CE_BlackHole -> "Hai con tàu bị dịch chuyển."
        CE_Tax -> "Thuế thiên hà làm thất thoát tài nguyên."
        CE_ReverseGravity -> "Di chuyển tốn gấp đôi pin trong vòng này."
        CE_GalacticFair -> "Hội chợ đã đổi tài nguyên lấy vật phẩm."
        CE_SolarStorm -> "Bão mặt trời làm giảm pin."
        CE_TwinPlanet -> "Một hành tinh đã được nhân đôi."
        CE_Homecoming -> "Cả hai tàu bị kéo về Trái Đất."
        CE_GiftItem -> "Vũ trụ tặng mỗi người một vật phẩm."
        CE_TheftItem -> "Kẻ trộm vũ trụ lấy một vật phẩm của mỗi người."
        CE_SupplyDrop -> "Cả hai nhận thêm tài nguyên."
        CE_Plunder -> "Cướp biển lấy tài nguyên của cả hai.") "canon"



-- | Xử lý khi client chọn augment.
handlePickAugment :: Config -> PlayerId -> Int -> ServerState -> (ServerState, [IO ()])
handlePickAugment cfg pid choice state = case state of
    Playing gs c1 c2 timer aTimer ->
        case gsPendingAugments gs of
            Nothing -> (state, [])
            Just offers ->
                let validChoice = if choice < 0 || choice > 2 then 1 else choice
                    gs' = gs { gsAugmentChoices = Map.insert pid validChoice (gsAugmentChoices gs) }
                in if Map.size (gsAugmentChoices gs') >= 2
                   then resolveAugments cfg gs' c1 c2 offers
                   else (Playing gs' c1 c2 timer aTimer, [])
    _ -> (state, [])

-- | Cả 2 đã chọn xong, áp dụng augment và bắt đầu lượt mới.
resolveAugments :: Config -> GameState -> Client -> Client -> [AugmentOffer] -> (ServerState, [IO ()])
resolveAugments cfg gs c1 c2 offers =
    let p1Choice = Map.findWithDefault 1 Player1 (gsAugmentChoices gs)
        p2Choice = Map.findWithDefault 1 Player2 (gsAugmentChoices gs)
        pickAug pid choice st =
            let p = getPlayer pid st
                selected = offers !! (max 0 (min 2 choice))
            in setPlayer pid (p { playerAugments = selected : playerAugments p }) st
        gs1 = pickAug Player1 p1Choice gs
        gs2 = pickAug Player2 p2Choice gs1
        -- Chuyển sang lượt Player 1 và xóa trạng thái Augment
        gsFinal = startTurn cfg Player1 (gs2 { gsPendingAugments = Nothing, gsAugmentChoices = Map.empty })
        view1 = viewFor cfg Player1 gsFinal
        view2 = viewFor cfg Player2 gsFinal
        msg1 = AugmentResultMsg p1Choice p2Choice view1
        msg2 = AugmentResultMsg p2Choice p1Choice view2
    in ( Playing gsFinal c1 c2 Nothing Nothing
       , [ pushMsg (clientChan c1) msg1
         , pushMsg (clientChan c2) msg2
         ]
       )