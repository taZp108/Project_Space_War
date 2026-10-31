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
    | PickAugment Int     -- ^ chon augment (0, 1, 2)
    deriving (Show, Eq)

-- | Tin nhan server gui xuong nguoi choi.
data ServerMsg
    = Welcome PlayerId
    | WaitingForOpponent
    | GameStarted PlayerView
    | ActionAccepted ActionReport PlayerView
    | ActionRejected GameError
    | OpponentActed (Maybe Notice) PlayerView
    | GameOver GameResult GameSummary
    | EventTriggered EventNotification PlayerView
    | AugmentOfferMsg [AugmentOffer] Integer  -- ^ 3 offers, deadline (unix)
    | AugmentResultMsg Int Int PlayerView     -- ^ your choice, opponent choice, view
    | ProtocolError String
    deriving (Show, Eq)