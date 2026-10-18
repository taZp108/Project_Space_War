-- | Module chinh cua package @space-war@.
--
-- Re-export cac module game (@Game.*@) de cac noi khac chi can @import Lib@.
module Lib
    ( someFunc
    , projectName
    , module Game.Types
    , module Game.Config
    , module Game.State
    , module Game.Action
    , module Game.Turn
    , module Game.World
    , module Game.Generate
    ) where

import Game.Action
import Game.Config
import Game.Generate
import Game.State
import Game.Turn
import Game.Types
import Game.World

-- | In mot dong chao mau (giu lai tu template cua stack).
someFunc :: IO ()
someFunc = putStrLn "someFunc"

-- | Ten cua project.
--
-- Vi du:
--
-- >>> projectName
-- "space-war"
projectName :: String
projectName = "space-war"