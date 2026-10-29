-- | Cac tin nhan giua client (trinh duyet) va server.
module Protocol.Message
    ( ClientMsg (..)
    , ServerMsg (..)
    ) where

import Game.Types
import Game.View

-- | Tin nhan nguoi choi gui len server.
data ClientMsg
    = Join                -- ^ xin vao tran
    | DoAction Action     -- ^ lam mot action
    deriving (Show, Eq)

-- | Tin nhan server gui xuong nguoi choi.
data ServerMsg
    = Welcome PlayerId                          -- ^ chao mung, cho biet minh la ai
    | WaitingForOpponent                        -- ^ dang cho nguoi choi thu hai
    | GameStarted PlayerView                    -- ^ tran bat dau
    | ActionAccepted ActionReport PlayerView    -- ^ action cua minh duoc chap nhan
    | ActionRejected GameError                  -- ^ action cua minh bi tu choi
    | OpponentActed (Maybe Notice) PlayerView   -- ^ doi thu vua lam xong, kem thong bao neu co
    | GameOver GameResult GameSummary           -- ^ tran ket thuc
    | ProtocolError String                      -- ^ tin nhan gui len bi hong hoac khong hieu
    deriving (Show, Eq)