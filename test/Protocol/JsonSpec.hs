{-# LANGUAGE OverloadedStrings #-}

module Protocol.JsonSpec (spec) where

import Data.Aeson (Value (..), decode, eitherDecode, encode, object, toJSON, (.=))
import qualified Data.Aeson.Key as K
import qualified Data.Aeson.KeyMap as KM
import qualified Data.ByteString.Lazy.Char8 as BL
import Data.Either (isLeft)
import Data.List (sort)
import Data.Text (Text)
import qualified Data.Text as T
import Test.Hspec
import Test.QuickCheck

import Game.TestUtil
import Game.Types
import Game.View
import Protocol.Json
import Protocol.Message

-- | Doc mot chuoi JSON thanh tin nhan client.
parse :: String -> Either String ClientMsg
parse = decodeClientMsg . BL.pack


-- | Cac khoa cua mot doi tuong JSON, da sap xep.
keysOf :: Value -> [String]
keysOf (Object o) = sort (map (T.unpack . K.toText) (KM.keys o))
keysOf _          = []

-- | Lay mot truong cua doi tuong JSON.
field :: K.Key -> Value -> Maybe Value
field k (Object o) = KM.lookup k o
field _ _          = Nothing

-- | Tin nhan client ngau nhien, de thu ma hoa roi giai ma.
genClientMsg :: Gen ClientMsg
genClientMsg = oneof
    [ pure Join
    , DoAction <$> genAct
    ]
  where
    genAct = oneof
        [ Move <$> elements [minBound .. maxBound]
        , pure Observe
        , pure ScanArea
        , pure ScanNearest
        , pure ScanOpponent
        , Mine <$> elements [minBound .. maxBound]
        , pure Deposit
        , Recharge <$> elements [minBound .. maxBound] <*> choose (-5, 100)
        , pure EndTurn
        ]

viewP1 :: PlayerView
viewP1 = viewFor cfg Player1 baseState

typeOf :: Text -> Value
typeOf t = String t

spec :: Spec
spec = do
  describe "decodeClientMsg: tin hop le" $ do
    it "join" $
      parse "{\"type\":\"join\"}" `shouldBe` Right Join
    it "cac action khong tham so" $ do
      let act kind = parse ("{\"type\":\"action\",\"action\":{\"type\":\"" ++ kind ++ "\"}}")
      act "observe" `shouldBe` Right (DoAction Observe)
      act "scan_area" `shouldBe` Right (DoAction ScanArea)
      act "scan_nearest" `shouldBe` Right (DoAction ScanNearest)
      act "scan_opponent" `shouldBe` Right (DoAction ScanOpponent)
      act "deposit" `shouldBe` Right (DoAction Deposit)
      act "end_turn" `shouldBe` Right (DoAction EndTurn)
    it "move kem huong" $
      parse "{\"type\":\"action\",\"action\":{\"type\":\"move\",\"direction\":\"up\"}}"
        `shouldBe` Right (DoAction (Move DirUp))
    it "mine kem loai tai nguyen" $
      parse "{\"type\":\"action\",\"action\":{\"type\":\"mine\",\"resource\":\"rare_ore\"}}"
        `shouldBe` Right (DoAction (Mine RareOre))
    it "recharge kem loai va so luong" $
      parse "{\"type\":\"action\",\"action\":{\"type\":\"recharge\",\"resource\":\"crystal\",\"amount\":3}}"
        `shouldBe` Right (DoAction (Recharge Crystal 3))

  describe "decodeClientMsg: tin hong bi tu choi" $ do
    it "khong phai JSON" $
      parse "hello" `shouldSatisfy` isLeft
    it "loai tin nhan la" $
      parse "{\"type\":\"dance\"}" `shouldSatisfy` isLeft
    it "thieu truong type" $
      parse "{}" `shouldSatisfy` isLeft
    it "action la" $
      parse "{\"type\":\"action\",\"action\":{\"type\":\"teleport\"}}" `shouldSatisfy` isLeft
    it "move thieu huong" $
      parse "{\"type\":\"action\",\"action\":{\"type\":\"move\"}}" `shouldSatisfy` isLeft
    it "huong khong hop le" $
      parse "{\"type\":\"action\",\"action\":{\"type\":\"move\",\"direction\":\"sideways\"}}" `shouldSatisfy` isLeft
    it "loai tai nguyen khong hop le" $
      parse "{\"type\":\"action\",\"action\":{\"type\":\"mine\",\"resource\":\"gold\"}}" `shouldSatisfy` isLeft
    it "so luong sai kieu" $
      parse "{\"type\":\"action\",\"action\":{\"type\":\"recharge\",\"resource\":\"iron\",\"amount\":\"many\"}}"
        `shouldSatisfy` isLeft

  describe "ma hoa roi giai ma tin nhan client" $
    it "giai ma (ma hoa m) = m voi moi tin nhan" $ property $
      forAll genClientMsg $ \m ->
        (eitherDecode (encode m) :: Either String ClientMsg) == Right m

  describe "toJSON: cac kieu nho" $ do
    it "Pos" $
      toJSON (Pos 3 4) `shouldBe` object ["x" .= (3 :: Int), "y" .= (4 :: Int)]
    it "huong, tam huong, tai nguyen, loai hanh tinh, nguoi choi la chuoi" $ do
      toJSON DirRight `shouldBe` String "right"
      toJSON SouthEast `shouldBe` String "south_east"
      toJSON ExoticMatter `shouldBe` String "exotic_matter"
      toJSON Mining `shouldBe` String "mining"
      toJSON Player2 `shouldBe` String "player2"
    it "kho tai nguyen la doi tuong ten -> so luong" $
      resourcesToJSON (rs [(Iron, 5), (EnergyCore, 2)])
        `shouldBe` object ["iron" .= (5 :: Int), "energy_core" .= (2 :: Int)]
    it "loi la chuoi snake_case" $ do
      toJSON NotYourTurn `shouldBe` String "not_your_turn"
      toJSON PlanetHasNoSuchResource `shouldBe` String "planet_has_no_such_resource"

  describe "toJSON: ket qua action" $ do
    it "Moved" $
      toJSON (Moved (Pos 1 2)) `shouldBe`
        object ["type" .= typeOf "moved", "pos" .= object ["x" .= (1 :: Int), "y" .= (2 :: Int)]]
    it "Mined" $
      toJSON (Mined Iron 5) `shouldBe`
        object ["type" .= typeOf "mined", "resource" .= typeOf "iron", "amount" .= (5 :: Int)]
    it "NearestPlanet co ket qua" $
      toJSON (NearestPlanet (Just (SouthEast, 20))) `shouldBe`
        object [ "type" .= typeOf "nearest_planet", "found" .= True
               , "direction" .= typeOf "south_east", "distance" .= (20 :: Int) ]
    it "NearestPlanet khong con hanh tinh" $
      toJSON (NearestPlanet Nothing) `shouldBe`
        object ["type" .= typeOf "nearest_planet", "found" .= False]
    it "PlanetsFound" $
      toJSON (PlanetsFound [KnownPlanet (Pos 60 60) Mining]) `shouldBe`
        object [ "type" .= typeOf "planets_found"
               , "planets" .= [ object [ "pos" .= object ["x" .= (60 :: Int), "y" .= (60 :: Int)]
                                       , "type" .= typeOf "mining" ] ] ]
    it "Deposited" $
      toJSON (Deposited (rs [(Crystal, 2)])) `shouldBe`
        object ["type" .= typeOf "deposited", "resources" .= object ["crystal" .= (2 :: Int)]]
    it "ActionReport khong co thong bao thi notice la null" $
      toJSON (ActionReport TurnEnded Nothing) `shouldBe`
        object ["result" .= object ["type" .= typeOf "turn_ended"], "notice" .= Null]
    it "ActionReport co thong bao" $
      toJSON (ActionReport (OpponentDirection North) (Just YouWereScanned)) `shouldBe`
        object [ "result" .= object [ "type" .= typeOf "opponent_direction", "direction" .= typeOf "north" ]
               , "notice" .= typeOf "you_were_scanned" ]

  describe "toJSON: ket qua tran dau" $ do
    it "Winner" $
      toJSON (Winner Player1 ReachedTarget) `shouldBe`
        object ["type" .= typeOf "winner", "player" .= typeOf "player1", "reason" .= typeOf "reached_target"]
    it "Draw" $
      toJSON Draw `shouldBe` object ["type" .= typeOf "draw"]
    it "giai doan Finished kem ket qua" $
      toJSON (Finished Draw) `shouldBe`
        object ["type" .= typeOf "finished", "result" .= object ["type" .= typeOf "draw"]]

  describe "PlayerView" $ do
    it "co dung cac truong da thoa thuan, khong co thong tin cua doi thu" $
      keysOf (toJSON viewP1) `shouldBe` sort
        [ "you", "map_width", "map_height", "earth", "round", "max_rounds"
        , "current_player", "phase", "pos", "battery", "battery_max", "ap", "ap_max"
        , "cargo", "cargo_capacity", "storage", "score", "score_target"
        , "known_planets", "planet_here" ]
    it "mot so gia tri" $ do
      let v = toJSON viewP1
      field "you" v `shouldBe` Just (String "player1")
      field "score" v `shouldBe` Just (toJSON (0 :: Int))
      field "known_planets" v `shouldBe` Just (toJSON ([] :: [Int]))
      field "planet_here" v `shouldBe` Just Null
    it "planet_here co ton kho khi dang dung tren hanh tinh" $ do
      let gs = baseState
          here = Just testPlanet
          v = toJSON ((viewFor cfg Player1 gs) { viewHere = here })
      fmap keysOf (field "planet_here" v) `shouldBe` Just (sort ["id", "pos", "type", "stock"])

  describe "ServerMsg" $ do
    it "Welcome" $
      toJSON (Welcome Player2) `shouldBe`
        object ["type" .= typeOf "welcome", "player" .= typeOf "player2"]
    it "WaitingForOpponent" $
      toJSON WaitingForOpponent `shouldBe` object ["type" .= typeOf "waiting_for_opponent"]
    it "ActionRejected" $
      toJSON (ActionRejected NotEnoughAP) `shouldBe`
        object ["type" .= typeOf "action_rejected", "error" .= typeOf "not_enough_ap"]
    it "ProtocolError" $
      toJSON (ProtocolError "bad") `shouldBe`
        object ["type" .= typeOf "protocol_error", "message" .= typeOf "bad"]
    it "OpponentActed kem thong bao" $ do
      let v = toJSON (OpponentActed (Just YouWereScanned) viewP1)
      field "type" v `shouldBe` Just (String "opponent_acted")
      field "notice" v `shouldBe` Just (String "you_were_scanned")
      fmap keysOf (field "view" v) `shouldBe` Just (keysOf (toJSON viewP1))
    it "ActionAccepted gom bao cao va view" $
      keysOf (toJSON (ActionAccepted (ActionReport TurnEnded Nothing) viewP1))
        `shouldBe` sort ["type", "report", "view"]
    it "GameStarted gom view" $
      keysOf (toJSON (GameStarted viewP1)) `shouldBe` sort ["type", "view"]
    it "GameOver lo diem va vi tri cuoi cua ca hai ben" $
      toJSON (GameOver Draw (GameSummary (PlayerFinal (Pos 1 2) 3) (PlayerFinal (Pos 4 5) 6)))
        `shouldBe` object
          [ "type" .= typeOf "game_over"
          , "result" .= object ["type" .= typeOf "draw"]
          , "summary" .= object
              [ "player1" .= object ["pos" .= object ["x" .= (1 :: Int), "y" .= (2 :: Int)], "score" .= (3 :: Int)]
              , "player2" .= object ["pos" .= object ["x" .= (4 :: Int), "y" .= (5 :: Int)], "score" .= (6 :: Int)]
              ]
          ]
    it "encodeServerMsg ra chuoi JSON giai ma lai ra dung gia tri" $ do
      let m = ActionRejected CargoFull
      decode (encodeServerMsg m) `shouldBe` Just (toJSON m)