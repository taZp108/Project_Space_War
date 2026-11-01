{-# LANGUAGE OverloadedStrings #-}
module Main (main) where

import Control.Concurrent.MVar (newMVar)
import Network.WebSockets (runServer, acceptRequest)

import Game.Config (defaultConfig, configV2)
import Server.Handler (runClient)
import Server.Types (ServerState(..))

main :: IO ()
main = do
    putStrLn "Starting Space War Server on ws://0.0.0.0:8080"
    let cfg = configV2
    stateVar <- newMVar Empty
    runServer "0.0.0.0" 8080 $ \pending -> do
        conn <- acceptRequest pending
        runClient cfg stateVar conn