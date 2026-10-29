{-# LANGUAGE OverloadedStrings #-}
{-# OPTIONS_GHC -Wno-orphans #-}

-- | Chuyen cac kieu cua game va cac tin nhan sang JSON (va nguoc lai), viet tay.
--
-- Cac instance duoc dat o day thay vi trong "Game.Types" de loi game khong phu
-- thuoc vao JSON (vi vay phai tat canh bao orphan o dau file).
module Protocol.Json
    ( encodeServerMsg
    , decodeClientMsg
    , resourcesToJSON
    ) where

import Data.Aeson
    ( FromJSON (..), ToJSON (..), Value (..), eitherDecode, encode, object
    , withObject, withText, (.:), (.=)
    )
import Data.Aeson.Key (fromText)
import Data.Aeson.Types (Pair, Parser)
import qualified Data.ByteString.Lazy as BL
import qualified Data.Map.Strict as Map
import Data.Text (Text)
import qualified Data.Text as T

import Game.Types
import Game.View
import Protocol.Message

-- | Ma hoa mot tin nhan server thanh chuoi JSON de gui di.
encodeServerMsg :: ServerMsg -> BL.ByteString
encodeServerMsg = encode

-- | Giai ma mot tin nhan tu client. Tra ve 'Left' kem ly do neu tin hong.
decodeClientMsg :: BL.ByteString -> Either String ClientMsg
decodeClientMsg = eitherDecode

-- | Doi mot kho tai nguyen thanh doi tuong JSON, vi du @{"iron": 5}@.
resourcesToJSON :: Resources -> Value
resourcesToJSON rs =
    object [ fromText (resourceName t) .= n | (t, n) <- Map.toList rs ]

-- | Doi tuong JSON co truong "type" de phan biet cac truong hop.
tagged :: Text -> [Pair] -> Value
tagged kind fields = object (("type" .= kind) : fields)

-- | Doc mot chuoi JSON thanh gia tri theo bang (ten, gia tri).
parseEnum :: String -> [(Text, a)] -> Value -> Parser a
parseEnum what table = withText what $ \t ->
    case lookup t table of
        Just x  -> pure x
        Nothing -> fail ("unknown " ++ what ++ ": " ++ T.unpack t)

-- ---------------------------------------------------------------------------
-- Vi tri, huong, tai nguyen

instance ToJSON Pos where
    toJSON (Pos x y) = object ["x" .= x, "y" .= y]

directionName :: Direction -> Text
directionName DirUp    = "up"
directionName DirDown  = "down"
directionName DirLeft  = "left"
directionName DirRight = "right"

instance ToJSON Direction where
    toJSON = String . directionName

instance FromJSON Direction where
    parseJSON = parseEnum "direction" [ (directionName d, d) | d <- [minBound .. maxBound] ]

compassName :: Compass -> Text
compassName North     = "north"
compassName NorthEast = "north_east"
compassName East      = "east"
compassName SouthEast = "south_east"
compassName South     = "south"
compassName SouthWest = "south_west"
compassName West      = "west"
compassName NorthWest = "north_west"
compassName Here      = "here"

instance ToJSON Compass where
    toJSON = String . compassName

resourceName :: ResourceType -> Text
resourceName Iron         = "iron"
resourceName Crystal      = "crystal"
resourceName EnergyCore   = "energy_core"
resourceName RareOre      = "rare_ore"
resourceName ExoticMatter = "exotic_matter"

instance ToJSON ResourceType where
    toJSON = String . resourceName

instance FromJSON ResourceType where
    parseJSON = parseEnum "resource" [ (resourceName r, r) | r <- [minBound .. maxBound] ]

-- ---------------------------------------------------------------------------
-- Hanh tinh va nguoi choi

planetTypeName :: PlanetType -> Text
planetTypeName Mining = "mining"
planetTypeName Energy = "energy"
planetTypeName Rare   = "rare"

instance ToJSON PlanetType where
    toJSON = String . planetTypeName

playerIdName :: PlayerId -> Text
playerIdName Player1 = "player1"
playerIdName Player2 = "player2"

instance ToJSON PlayerId where
    toJSON = String . playerIdName

instance ToJSON KnownPlanet where
    toJSON kp = object ["pos" .= knownPos kp, "type" .= knownType kp]

instance ToJSON Planet where
    toJSON pl = object
        [ "id"    .= planetId pl
        , "pos"   .= planetPos pl
        , "type"  .= planetType pl
        , "stock" .= resourcesToJSON (planetStock pl)
        ]

-- | Mot hanh tinh da kham pha, kem ma so.
knownPlanetEntry :: (PlanetId, KnownPlanet) -> Value
knownPlanetEntry (pid, kp) = object
    [ "id" .= pid, "pos" .= knownPos kp, "type" .= knownType kp ]

-- ---------------------------------------------------------------------------
-- Ket qua tran dau

winReasonName :: WinReason -> Text
winReasonName ReachedTarget        = "reached_target"
winReasonName OpponentOutOfBattery = "opponent_out_of_battery"
winReasonName OpponentDisconnected = "opponent_disconnected"
winReasonName HigherScoreAtLimit   = "higher_score_at_limit"

instance ToJSON WinReason where
    toJSON = String . winReasonName

instance ToJSON GameResult where
    toJSON (Winner pid reason) = tagged "winner" ["player" .= pid, "reason" .= reason]
    toJSON Draw                = tagged "draw" []

instance ToJSON GamePhase where
    toJSON WaitingForPlayers = tagged "waiting" []
    toJSON InProgress        = tagged "in_progress" []
    toJSON (Finished result) = tagged "finished" ["result" .= result]

-- ---------------------------------------------------------------------------
-- Action va bao cao

errorName :: GameError -> Text
errorName GameNotInProgress       = "game_not_in_progress"
errorName NotYourTurn             = "not_your_turn"
errorName NotEnoughAP             = "not_enough_ap"
errorName NotEnoughBattery        = "not_enough_battery"
errorName OutOfBounds             = "out_of_bounds"
errorName NotOnPlanet             = "not_on_planet"
errorName PlanetHasNoSuchResource = "planet_has_no_such_resource"
errorName CargoFull               = "cargo_full"
errorName CargoEmpty              = "cargo_empty"
errorName NotAtEarth              = "not_at_earth"
errorName OutOfDepositRange       = "out_of_deposit_range"
errorName BatteryFull             = "battery_full"
errorName NotEnoughResources      = "not_enough_resources"
errorName InvalidAmount           = "invalid_amount"

instance ToJSON GameError where
    toJSON = String . errorName

instance ToJSON Notice where
    toJSON YouWereScanned = "you_were_scanned"

instance ToJSON Action where
    toJSON (Move dir)       = tagged "move" ["direction" .= dir]
    toJSON Observe          = tagged "observe" []
    toJSON ScanArea         = tagged "scan_area" []
    toJSON ScanNearest      = tagged "scan_nearest" []
    toJSON ScanOpponent     = tagged "scan_opponent" []
    toJSON (Mine res)       = tagged "mine" ["resource" .= res]
    toJSON Deposit          = tagged "deposit" []
    toJSON (Recharge res n) = tagged "recharge" ["resource" .= res, "amount" .= n]
    toJSON EndTurn          = tagged "end_turn" []

instance FromJSON Action where
    parseJSON = withObject "Action" $ \o -> do
        kind <- o .: "type" :: Parser Text
        case kind of
            "move"          -> Move <$> o .: "direction"
            "observe"       -> pure Observe
            "scan_area"     -> pure ScanArea
            "scan_nearest"  -> pure ScanNearest
            "scan_opponent" -> pure ScanOpponent
            "mine"          -> Mine <$> o .: "resource"
            "deposit"       -> pure Deposit
            "recharge"      -> Recharge <$> o .: "resource" <*> o .: "amount"
            "end_turn"      -> pure EndTurn
            other           -> fail ("unknown action: " ++ T.unpack other)

instance ToJSON ActionResult where
    toJSON (Moved pos) = tagged "moved" ["pos" .= pos]
    toJSON (PlanetsFound planets) = tagged "planets_found" ["planets" .= planets]
    toJSON (NearestPlanet Nothing) = tagged "nearest_planet" ["found" .= False]
    toJSON (NearestPlanet (Just (direction, dist))) =
        tagged "nearest_planet" ["found" .= True, "direction" .= direction, "distance" .= dist]
    toJSON (OpponentDirection direction) = tagged "opponent_direction" ["direction" .= direction]
    toJSON (Mined res amount) = tagged "mined" ["resource" .= res, "amount" .= amount]
    toJSON (Deposited rs) = tagged "deposited" ["resources" .= resourcesToJSON rs]
    toJSON (Recharged amount) = tagged "recharged" ["amount" .= amount]
    toJSON TurnEnded = tagged "turn_ended" []

instance ToJSON ActionReport where
    toJSON rep = object
        [ "result" .= reportResult rep
        , "notice" .= reportNotice rep
        ]

-- ---------------------------------------------------------------------------
-- View va tong ket

instance ToJSON PlayerView where
    toJSON v = object
        [ "you"              .= viewSelf v
        , "map_width"        .= viewMapWidth v
        , "map_height"       .= viewMapHeight v
        , "earth"            .= viewEarth v
        , "round"            .= viewRound v
        , "max_rounds"       .= viewMaxRounds v
        , "current_player"   .= viewCurrent v
        , "phase"            .= viewPhase v
        , "pos"              .= viewPos v
        , "battery"          .= viewBattery v
        , "battery_max"      .= viewBatteryMax v
        , "ap"               .= viewAP v
        , "ap_max"           .= viewApMax v
        , "cargo"            .= resourcesToJSON (viewCargo v)
        , "cargo_capacity"   .= viewCargoCapacity v
        , "storage"          .= resourcesToJSON (viewStorage v)
        , "score"            .= viewScore v
        , "score_target"     .= viewScoreTarget v
        , "known_planets"    .= map knownPlanetEntry (Map.toList (viewKnown v))
        , "planet_here"      .= viewHere v
        ]

instance ToJSON PlayerFinal where
    toJSON f = object ["pos" .= finalPos f, "score" .= finalScore f]

instance ToJSON GameSummary where
    toJSON s = object
        [ "player1" .= summaryPlayer1 s
        , "player2" .= summaryPlayer2 s
        ]

-- ---------------------------------------------------------------------------
-- Tin nhan

instance ToJSON ClientMsg where
    toJSON Join           = tagged "join" []
    toJSON (DoAction act) = tagged "action" ["action" .= act]

instance FromJSON ClientMsg where
    parseJSON = withObject "ClientMsg" $ \o -> do
        kind <- o .: "type" :: Parser Text
        case kind of
            "join"   -> pure Join
            "action" -> DoAction <$> o .: "action"
            other    -> fail ("unknown message: " ++ T.unpack other)

instance ToJSON ServerMsg where
    toJSON (Welcome pid) = tagged "welcome" ["player" .= pid]
    toJSON WaitingForOpponent = tagged "waiting_for_opponent" []
    toJSON (GameStarted view) = tagged "game_started" ["view" .= view]
    toJSON (ActionAccepted rep view) =
        tagged "action_accepted" ["report" .= rep, "view" .= view]
    toJSON (ActionRejected err) = tagged "action_rejected" ["error" .= err]
    toJSON (OpponentActed notice view) =
        tagged "opponent_acted" ["notice" .= notice, "view" .= view]
    toJSON (GameOver result summary) =
        tagged "game_over" ["result" .= result, "summary" .= summary]
    toJSON (ProtocolError msg) = tagged "protocol_error" ["message" .= msg]