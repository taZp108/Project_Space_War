{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE ScopedTypeVariables #-}
module Server.Handler
    ( runClient
    ) where

import Control.Concurrent.Async (async, cancel, race_)
import Control.Concurrent (threadDelay)
import Control.Concurrent.MVar
import Control.Concurrent.STM (newTChan, atomically, readTChan)
import Control.Exception (catch, SomeException)
import Control.Monad (forever)
import Data.IORef
import qualified Data.Map.Strict as Map
import Network.WebSockets hiding (runClient)
import System.Random (randomIO)
import System.IO (hFlush, stdout)
import Data.Time.Clock.POSIX (getPOSIXTime)

import Game.Config
import Game.Types
import Protocol.Json
import Protocol.Message
import Server.Lobby
import Server.Types

-- | Kiểm tra xem có đang trong giai đoạn chọn Augment không.
hasPendingAugment :: ServerState -> Bool
hasPendingAugment (Playing gs _ _ _ _) = case gsPendingAugments gs of
    Just _ -> True
    Nothing -> False
hasPendingAugment _ = False

turnToken :: ServerState -> Maybe (Int, PlayerId)
turnToken (Playing gs _ _ _ _) = Just (gsRound gs, gsCurrent gs)
turnToken _ = Nothing

stopTurnTimer :: MVar ServerState -> IO ()
stopTurnTimer stateVar = do
    timer <- modifyMVar stateVar $ \st -> case st of
        Playing gs c1 c2 _ aTimer -> pure (Playing gs c1 c2 Nothing aTimer, Nothing)
        _ -> pure (st, Nothing)
    maybe (pure ()) (cancel . turnTimerAsync) timer

stopAugmentTimer :: MVar ServerState -> IO ()
stopAugmentTimer stateVar = do
    timer <- modifyMVar stateVar $ \st -> case st of
        Playing gs c1 c2 tTimer _ -> pure (Playing gs c1 c2 tTimer Nothing, Nothing)
        _ -> pure (st, Nothing)
    maybe (pure ()) (cancel . turnTimerAsync) timer

restartTurnTimer :: Config -> MVar ServerState -> IO ()
restartTurnTimer cfg stateVar = do
    stopTurnTimer stateVar
    stopAugmentTimer stateVar
    state <- readMVar stateVar
    case state of
        Playing gs c1 c2 _ _ | Just _ <- gsPendingAugments gs -> do
            -- Bắt đầu augment timer 30s
            deadline <- (floor . (+ 30) <$> getPOSIXTime)
            timer <- async $ do
                threadDelay (30 * 1000000)
                expired <- modifyMVar stateVar $ \st -> case st of
                    Playing gs' c1' c2' t _ | Just _ <- gsPendingAugments gs' -> do
                        -- Tự động pick 1 (ở giữa) cho ai chưa chọn
                        let (st1, acts1) = if Map.notMember Player1 (gsAugmentChoices gs')
                                           then handlePickAugment cfg Player1 1 st
                                           else (st, [])
                            (st2, acts2) = if Map.notMember Player2 (gsAugmentChoices gs')
                                           then handlePickAugment cfg Player2 1 st1
                                           else (st1, [])
                        sequence_ (acts1 ++ acts2)
                        pure (st2, True)
                    _ -> pure (st, False)
                if expired then restartTurnTimer cfg stateVar else pure ()
            modifyMVar_ stateVar $ \st -> case st of
                Playing gs' c1' c2' t _ | Just _ <- gsPendingAugments gs' -> pure (Playing gs' c1' c2' t (Just (TurnTimer timer deadline)))
                _ -> cancel timer >> pure st
        Playing gs _ _ _ _ | gsPhase gs == InProgress -> do
            let roundNo = gsRound gs
                pid = gsCurrent gs
            deadline <- (floor . (+ 90) <$> getPOSIXTime)
            timer <- async $ do
                threadDelay (90 * 1000000)
                expired <- modifyMVar stateVar $ \st -> case st of
                    Playing gs' c1 c2 _ _ | gsRound gs' == roundNo && gsCurrent gs' == pid && gsPhase gs' == InProgress -> do
                        let (next, acts) = handleAction cfg pid EndTurn (Playing gs' c1 c2 Nothing Nothing)
                        sequence_ acts
                        pure (next, True)
                    _ -> pure (st, False)
                if expired then restartTurnTimer cfg stateVar else pure ()
            modifyMVar_ stateVar $ \st -> case st of
                Playing gs' c1 c2 _ _ | gsRound gs' == roundNo && gsCurrent gs' == pid -> pure (Playing gs' c1 c2 (Just (TurnTimer timer deadline)) Nothing)
                _ -> cancel timer >> pure st
        _ -> pure ()

-- | Vòng lặp chạy cho mỗi client kết nối.
runClient :: Config -> MVar ServerState -> Connection -> IO ()
runClient cfg stateVar conn = do
    chan <- atomically newTChan
    let client = Client chan
    pidRef <- newIORef Nothing
    
    let sendLoop = forever $ do
            msg <- atomically $ readTChan chan
            putStrLn $ "WS SEND: " ++ show msg
            hFlush stdout
            sendTextData conn (encodeServerMsg msg)
            
        receiveLoop = forever $ do
            raw <- receiveData conn
            case decodeClientMsg raw of
                Left err -> do
                    putStrLn $ "WS BAD MESSAGE: " ++ err
                    hFlush stdout
                    sendTextData conn (encodeServerMsg (ProtocolError err))
                Right msg -> do
                    putStrLn $ "WS RECEIVE: " ++ show msg
                    hFlush stdout
                    handleMsg msg

        handleMsg Join = do
            seed <- randomIO :: IO Int
            oldState <- readMVar stateVar
            (pidResult, acts) <- modifyMVar stateVar $ \st -> do
                let (st', pidResult', acts') = handleJoin cfg client seed st
                pure (st', (pidResult', acts'))
            sequence_ acts
            newState <- readMVar stateVar
            if turnToken oldState /= turnToken newState then restartTurnTimer cfg stateVar else pure ()
            case pidResult of
                Right pid -> writeIORef pidRef (Just pid)
                Left _ -> pure ()

        handleMsg (DoAction act) = do
            mpid <- readIORef pidRef
            case mpid of
                Nothing -> sendTextData conn (encodeServerMsg (ProtocolError "Must join first"))
                Just pid -> do
                    oldState <- readMVar stateVar
                    modifyMVar_ stateVar $ \st -> do
                        let (st', acts) = handleAction cfg pid act st
                        sequence_ acts
                        pure st'
                    newState <- readMVar stateVar
                    if turnToken oldState /= turnToken newState || hasPendingAugment newState
                        then restartTurnTimer cfg stateVar
                        else pure ()

        handleMsg (PickAugment choice) = do
            mpid <- readIORef pidRef
            case mpid of
                Nothing -> sendTextData conn (encodeServerMsg (ProtocolError "Must join first"))
                Just pid -> do
                    modifyMVar_ stateVar $ \st -> do
                        let (st', acts) = handlePickAugment cfg pid choice st
                        sequence_ acts
                        pure st'
                    newState <- readMVar stateVar
                    case newState of
                        Playing gs _ _ _ _ | not (hasPendingAugment newState) -> restartTurnTimer cfg stateVar
                        _ -> pure ()

    -- Chạy song song send và receive. Nếu 1 trong 2 lỗi (disconnect), dừng cả 2.
    race_ sendLoop receiveLoop `catch` \(_ :: SomeException) -> do
        stopTurnTimer stateVar
        stopAugmentTimer stateVar
        mpid <- readIORef pidRef
        case mpid of
            Nothing -> pure ()
            Just pid -> do
                modifyMVar_ stateVar $ \st -> do
                    let (st', acts) = handleDisconnect cfg pid st
                    sequence_ acts
                    pure st'