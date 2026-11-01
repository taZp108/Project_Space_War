{-# LANGUAGE OverloadedStrings #-}
module Server.Types
    ( Client (..)
    , ServerState (..)
    , TurnTimer (..)
    ) where

import Control.Concurrent.STM (TChan)
import Control.Concurrent.Async (Async)
import Protocol.Message (ServerMsg)
import Game.Types (GameState)

-- | Đại diện cho một kết nối client.
data Client = Client
    { clientChan :: TChan ServerMsg
    }

data TurnTimer = TurnTimer
    { turnTimerAsync :: Async ()
    , turnTimerDeadline :: Integer
    }

-- | Trạng thái toàn cục của Server.
-- Playing có 2 Maybe TurnTimer: TurnTimer bình thường, AugmentTimer (30s)
data ServerState
    = Empty
    | Waiting Client
    | Playing GameState Client Client (Maybe TurnTimer) (Maybe TurnTimer)