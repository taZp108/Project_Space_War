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
    , withObject, withText, (.:), (.:?), (.=)
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

instance FromJSON Pos where
    parseJSON = withObject "Pos" $ \o -> Pos <$> o .: "x" <*> o .: "y"

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
resourceName PinkDiamond = "pink_diamond"
resourceName Spinel = "spinel"
resourceName HollyBlueAgate = "holly_blue_agate"
resourceName Peridot = "peridot"
resourceName Topaz = "topaz"
resourceName Carnelian = "carnelian"
resourceName Jasper = "jasper"
resourceName Amethyst = "amethyst"

itemName :: ItemId -> Text
itemName = T.pack . ("it_" ++) . camelSnake . drop 3 . show
  where
    camelSnake [] = []
    camelSnake (c:cs) = lower c : concatMap step cs
    step c | c >= 'A' && c <= 'Z' = '_' : [lower c]
           | otherwise = [c]
    lower c | c >= 'A' && c <= 'Z' = toEnum (fromEnum c + 32) | otherwise = c

instance ToJSON ItemId where toJSON = String . itemName
instance FromJSON ItemId where
    parseJSON = parseEnum "item" [(itemName i, i) | i <- [minBound .. maxBound]]

instance ToJSON Inventory where
    toJSON inv = object ["passives" .= object [fromText (itemName i) .= n | (i,n) <- Map.toList (invPassives inv)], "actives" .= invActives inv]

canonName :: CanonEvent -> Text
canonName = T.pack . show
instance ToJSON CanonEvent where toJSON = String . canonName
instance ToJSON PlanetEvent where toJSON = String . T.pack . show

instance ToJSON Rarity where
    toJSON Silver  = String "silver"
    toJSON Gold    = String "gold"
    toJSON Diamond = String "diamond"

augmentTypeName :: AugmentType -> Text
augmentTypeName Aug_BatteryMax    = "battery_max"
augmentTypeName Aug_MoveCost      = "move_cost"
augmentTypeName Aug_CargoMax      = "cargo_max"
augmentTypeName Aug_APMax         = "ap_max"
augmentTypeName Aug_Midas         = "midas"
augmentTypeName Aug_Luck          = "luck"
augmentTypeName Aug_ScanRadius    = "scan_radius"
augmentTypeName Aug_CraftDiscount = "craft_discount"

instance ToJSON AugmentType where
    toJSON = String . augmentTypeName

instance ToJSON AugmentOffer where
    toJSON o = object
        [ "id"     .= offerId o
        , "type"   .= augType o
        , "rarity" .= augRarity o
        ]

instance ToJSON EventNotification where
    toJSON e = object
        [ "event_name"  .= eventName e
        , "effect_desc" .= effectDesc e
        , "kind"        .= eventKind e
        ]

instance ToJSON ResourceType where
    toJSON = String . resourceName

instance FromJSON ResourceType where
    parseJSON = parseEnum "resource"
        ([ (resourceName r, r) | r <- [minBound .. maxBound] ] ++
         [("iron", Iron), ("crystal", Crystal), ("energy_core", EnergyCore), ("rare_ore", RareOre), ("exotic_matter", ExoticMatter)])

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
    toJSON kp = object $
        [ "pos" .= knownPos kp
        , "type" .= knownType kp
        ] ++
        maybe [] (\s -> ["stock" .= resourcesToJSON s]) (knownStock kp) ++
        maybe [] (\e -> ["event_type" .= e]) (knownEvent kp)

instance ToJSON Planet where
    toJSON pl = object
        [ "id"    .= planetId pl
        , "pos"   .= planetPos pl
        , "type"  .= planetType pl
        , "stock" .= resourcesToJSON (planetStock pl)
        , "event_triggered" .= planetEventTriggered pl
        , "event_type" .= planetEventType pl
        ]

-- | Mot hanh tinh da kham pha, kem ma so.
knownPlanetEntry :: (PlanetId, KnownPlanet) -> Value
knownPlanetEntry (pid, kp) = object $
    [ "id" .= pid, "pos" .= knownPos kp, "type" .= knownType kp ] ++
    maybe [] (\s -> ["stock" .= resourcesToJSON s]) (knownStock kp) ++
    maybe [] (\e -> ["event_type" .= e]) (knownEvent kp)

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
errorName ItemUnavailable         = "item_unavailable"
errorName InventoryFull           = "inventory_full"

instance ToJSON GameError where
    toJSON = String . errorName

instance ToJSON Notice where
    toJSON YouWereScanned = "you_were_scanned"

instance ToJSON Action where
    toJSON (Move dir)       = tagged "move" ["direction" .= dir]
    toJSON (MoveTo pos)     = tagged "move" ["target" .= pos]
    toJSON Observe          = tagged "observe" []
    toJSON ScanArea         = tagged "scan_area" []
    toJSON ScanNearest      = tagged "scan_nearest" []
    toJSON ScanOpponent     = tagged "scan_opponent" []
    toJSON (Mine res)       = tagged "mine" ["resource" .= res]
    toJSON MineRandom       = tagged "mine" []
    toJSON (Craft item)     = tagged "craft" ["item" .= item]
    toJSON (UseItem item)   = tagged "use_item" ["item" .= item]
    toJSON Deposit          = tagged "deposit" []
    toJSON (Recharge res n) = tagged "recharge" ["resource" .= res, "amount" .= n]
    toJSON EndTurn          = tagged "end_turn" []

instance FromJSON Action where
    parseJSON = withObject "Action" $ \o -> do
        kind <- o .: "type" :: Parser Text
        case kind of
            "move"          -> do
                target <- o .:? "target"
                maybe (Move <$> o .: "direction") (pure . MoveTo) target
            "observe"       -> pure Observe
            "scan_area"     -> pure ScanArea
            "scan_nearest"  -> pure ScanNearest
            "scan_opponent" -> pure ScanOpponent
            "mine"          -> do
                resource <- o .:? "resource"
                maybe (pure MineRandom) (pure . Mine) resource
            "craft"         -> Craft <$> o .: "item"
            "use_item"      -> UseItem <$> o .: "item"
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
    toJSON (MinedAll rs) = tagged "mined_all" ["resources" .= resourcesToJSON rs]
    toJSON (Deposited rs) = tagged "deposited" ["resources" .= resourcesToJSON rs]
    toJSON (Recharged amount) = tagged "recharged" ["amount" .= amount]
    toJSON TurnEnded = tagged "turn_ended" []
    toJSON (PlanetEventOccurred ev result forced) = tagged "planet_event" ["event" .= ev, "result" .= result, "force_end_turn" .= forced]
    toJSON (CanonEventOccurred ev result) = tagged "canon_event" ["event" .= ev, "result" .= result]
    toJSON (ItemCrafted item) = tagged "item_crafted" ["item" .= item]
    toJSON (ItemUsed item) = tagged "item_used" ["item" .= item]

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
        , "inventory"        .= viewInventory v
        , "luck"             .= viewLuck v
        , "max_cargo"        .= viewMaxCargo v
        , "max_battery"      .= viewMaxBattery v
        , "active_event"     .= viewActiveEvent v
        , "can_craft"        .= viewCanCraft v
        , "turn_end_time"    .= viewTurnEndTime v
        , "augments"         .= viewAugments v
        ]
instance ToJSON PlayerFinal where
    toJSON f = object
        [ "pos"       .= finalPos f
        , "score"     .= finalScore f
        , "deposited" .= finalDeposited f
        ]

        
instance ToJSON GameSummary where
    toJSON s = object
        [ "player1" .= summaryPlayer1 s
        , "player2" .= summaryPlayer2 s
        ]

-- ---------------------------------------------------------------------------
-- Tin nhan

instance ToJSON ClientMsg where
    toJSON Join              = tagged "join" []
    toJSON (DoAction act)    = tagged "action" ["action" .= act]
    toJSON (PickAugment idx) = tagged "pick_augment" ["choice" .= idx]

instance FromJSON ClientMsg where
    parseJSON = withObject "ClientMsg" $ \o -> do
        kind <- o .: "type" :: Parser Text
        case kind of
            "join"         -> pure Join
            "action"       -> DoAction <$> o .: "action"
            "pick_augment" -> PickAugment <$> o .: "choice"
            other          -> fail ("unknown message: " ++ T.unpack other)


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
    toJSON (EventTriggered notice view) = tagged "event_triggered" ["event" .= notice, "view" .= view]
    toJSON (AugmentOfferMsg offers deadline) = tagged "augment_offer" ["offers" .= offers, "deadline" .= deadline]
    toJSON (AugmentResultMsg yourPick oppPick view) = tagged "augment_result" ["your_pick" .= yourPick, "opp_pick" .= oppPick, "view" .= view]