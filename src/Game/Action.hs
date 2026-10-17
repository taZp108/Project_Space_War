
module Game.Action
    ( performAction
    ) where

import Game.Types
import Game.Config
import Game.World
import qualified Data.Map.Strict as Map


--1. Hàm xử lý chung 
--Hàm nhận các action của người chơi rồi rẽ nhánh xử lý các hành động tương ứng, cập nhật kết quả vào đúng người chơi.

performAction :: Config -> PlayerId -> Action -> GameState -> Either GameError (GameState, ActionReport)
performAction config playerid act state = 
    let curplayer = if playerid == Player1 then gsPlayer1 state else gsPlayer2 state
        oppplayer = if playerid == Player1 then gsPlayer2 state else gsPlayer1 state
    in case act of
        Move direct -> 
            case actionMove config direct curplayer state of 
                Left err -> Left err 
                Right (playerNew, report) -> 
                    let stateNew = if playerid == Player1 
                        then state {gsPlayer1 = playerNew}
                        else state {gsPlayer2 = playerNew}
                    in Right(stateNew, report)

        Observe ->
            case actionObserve config curplayer state of  
                Left err -> Left err 
                Right (playerNew, report) -> 
                    let stateNew = if playerid == Player1 
                        then state {gsPlayer1 = playerNew}
                        else state {gsPlayer2 = playerNew}
                    in Right(stateNew, report)

        ScanArea ->
            case actionScanArea config curplayer state of  
                Left err -> Left err 
                Right (playerNew, report) -> 
                    let stateNew = if playerid == Player1 
                        then state {gsPlayer1 = playerNew}
                        else state {gsPlayer2 = playerNew}
                    in Right(stateNew, report)
        
        ScanNearest ->
            case actionScanNearest config curplayer state of  
                Left err -> Left err 
                Right (playerNew, report) -> 
                    let stateNew = if playerid == Player1 
                        then state {gsPlayer1 = playerNew}
                        else state {gsPlayer2 = playerNew}
                    in Right(stateNew, report)
        
        ScanOpponent ->
            case actionScanOpponent config curplayer oppplayer of 
                Left err -> Left err 
                Right (playerNew, report) -> 
                    let stateNew = if playerid == Player1 
                        then state {gsPlayer1 = playerNew}
                        else state {gsPlayer2 = playerNew}
                    in Right(stateNew, report)
                    
        _ -> Left GameNotInProgress

--2. Hàm kiểm tra chi phí 
--Xem có đủ chi phí để thực hiện hành động không.

checkResources :: Player -> Cost -> Either GameError ()
checkResources player cost = 
    if playerAP player < costAP cost then Left NotEnoughAP
    else if playerBattery player < costBattery cost then Left NotEnoughBattery
    else Right ()

--3. Hàm Move
--Di chuyển tàu đi tiếp 1 ô 

actionMove :: Config -> Direction -> Player -> GameState -> Either GameError (Player, ActionReport)
actionMove config direct player state =
    let posNew = movePos direct (playerPos player)
    in 
--trước khi di chuyển phải kiểm tra 2 điều kiện là ap/battery hoặc vị trí pos hiện tại có cho phép di chuyển tiếp hay không.
        case checkResources player (cfgCostMove config) of
            Left error -> Left error
            Right () --sau khi kiểm tra ap và battery thông qua thì tiếp tục kiểm tra biên
                | not (inBounds config posNew) -> Left OutOfBounds
                | otherwise -> 
                    let playerNew = player {
                        playerPos = posNew,
                        playerAP = playerAP player - costAP (cfgCostMove config),
                        playerBattery = playerBattery player - costBattery (cfgCostMove config)
                    }
                    in Right (playerNew, ActionReport {reportResult = Moved posNew, reportNotice= Nothing })

--4. Hàm Observe  
--Quét qua các hành tinh với bán kính 3 ô đổ lại quanh vị trí tàu.

actionObserve :: Config -> Player -> GameState -> Either GameError (Player, ActionReport)
actionObserve config player state =
    case checkResources player (cfgCostObserve config) of
        Left error -> Left error
        Right () ->
            let posShip = playerPos player
                allPlanet = Map.elems (gsPlanets state)
                foundPlannet = [p| p <- allPlanet, withinRadius (cfgObserveRadius config) posShip (planetPos p)]
                --danh sách lưu các planet tìm thấy
                planetFoundlist = [KnownPlanet (planetPos p) (planetType p) | p <- foundPlannet]
                --cập nhật lại các hành tinh đã khám phá 
                --các hành tinh mới biết
                newFound = Map.fromList [(planetId p, KnownPlanet (planetPos p) (planetType p)) | p <- foundPlannet]
                --gộp với các hành tinh đã khám phá trước đó
                newKnownPlanet = Map.union newFound (playerKnown player)
                playerNew = player { 
                    playerKnown = newKnownPlanet,
                    playerAP = playerAP player - costAP (cfgCostObserve config),
                    playerBattery = playerBattery player - costBattery (cfgCostObserve config)
                }

                report = ActionReport {reportResult = PlanetsFound planetFoundlist, reportNotice = Nothing} 
            in 
                Right (playerNew, report)


--5. Hàm ScanArea
--Quét qua các hành tinh với bán kính 8 ô đổ lại quanh vị trí tàu.

actionScanArea :: Config -> Player -> GameState -> Either GameError (Player, ActionReport)
actionScanArea config player state =
    case checkResources player (cfgCostScanArea config) of
            Left error -> Left error
            Right () ->
                let posShip = playerPos player
                    allPlanet = Map.elems (gsPlanets state)
                    foundPlannet = [p| p <- allPlanet, withinRadius (cfgScanRadius config) posShip (planetPos p)]
                    --danh sách lưu các planet tìm thấy
                    planetFoundlist = [KnownPlanet (planetPos p) (planetType p) | p <- foundPlannet]
                    --cập nhật lại các hành tinh đã khám phá 
                    --các hành tinh mới biết
                    newFound = Map.fromList [(planetId p, KnownPlanet (planetPos p) (planetType p)) | p <- foundPlannet]
                    --gộp với các hành tinh đã khám phá trước đó
                    newKnownPlanet = Map.union newFound (playerKnown player)
                    playerNew = player { 
                        playerKnown = newKnownPlanet,
                        playerAP = playerAP player - costAP (cfgCostScanArea config),
                        playerBattery = playerBattery player - costBattery (cfgCostScanArea config)
                    }

                    report = ActionReport {reportResult = PlanetsFound planetFoundlist, reportNotice = Nothing} 
                in 
                    Right (playerNew, report)

--6. Hàm ScanNearest 
-- Tìm hành tinh còn tài nguyên gần nhất rồi trả hướng và khoảng cách để đi tới hành tinh đó.

actionScanNearest :: Config -> Player -> GameState -> Either GameError (Player, ActionReport)
actionScanNearest config player state =
    case checkResources player (cfgCostScanNearest config) of
            Left error -> Left error
            Right () ->
                let posShip = playerPos player
                    allPlanet = Map.elems (gsPlanets state)
                --lọc ra các hành tinh còn tài nguyên khi tổng kho nó >0
                planetHaveResources = filter (\p -> sum (Map.elems (planetStock p)) > 0) allPlanet
                --khoảng cách với các hành tinh còn tài nguyên
                planetDistances = map (\p -> (p, distance posShip (planetPos p))) planetHaveResources
                --xử lý các trường hợp:
                resultAct =
                    case planetDistances of 
                    --TH1: không còn hành tinh nào còn tài nguyên
                        [] -> NearestPlanet Nothing 
                    --TH2: còn hành tinh còn tài nguyên, lọc ra các hành tinh có khoảng cách bé nhất
                        _ -> 
                            let minDistence = minimum (map (\(p, d) -> d) planetDistances)
                                nearPlanets = filter (\(p,d) -> d==minDistence) planetDistances
                                --so id giữa các planet có khoảng cách tới tàu gần nhất như nhau
                                finalMinPlanet = 
                                    if null nearPlanets then Nothing 
                                    else 
                                        let 
                                            minID (planet1,dis1) (planet2,dis2) =
                                                let id1 = planetId planet1
                                                    id2 = planetId planet2
                                                in 
                                                    if id1 < id2 then (planet1,dis1) else (planet2,dis2)
                                            
                                            nearestPlanet = foldr1 minID nearPlanets
                                        in Just nearestPlanet
                            in case finalMinPlanet of 
                                    Nothing -> NearestPlanet Nothing
                                    Just (finalPlanet,finalDistance) ->
                                        let dir = compassFrom posShip (planetPos finalPlanet)
                                        in NearestPlanet (Just (dir,finalDistance))
                    playerNew = player { 
                        playerAP = playerAP player - costAP (cfgCostScanNearest config),
                        playerBattery = playerBattery player - costBattery (cfgCostScanNearest config)
                    }

                    report = ActionReport {reportResult = resultAct, reportNotice = Nothing} 
                in 
                    Right (playerNew, report)


--7. Hàm ScanOpponent
--Quét xem đối thủ đang ở hướng nào.

actionScanOpponent ::  Config -> Player -> Player -> Either GameError (Player, ActionReport)
actionScanOpponent config player opponent =
    case checkResources player (cfgCostScanOpponent config) of
        Left error -> Left error
        Right () ->
            let 
                myPos = playerPos player
                opPos = playerPos opponent
                dir = compassFrom myPos opPos -- tính hướng tàu mình với tàu người
                playerNew = player { 
                        playerAP = playerAP player - costAP (cfgCostScanOpponent config),
                        playerBattery = playerBattery player - costBattery (cfgCostScanOpponent config)
                    }

                    report = ActionReport {reportResult = OpponentDirection dir, reportNotice = Just YouWereScanned} 
                in 
                    Right (playerNew, report)




            