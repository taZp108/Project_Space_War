{-# LANGUAGE NoRebindableSyntax #-}
{-# OPTIONS_GHC -fno-warn-missing-import-lists #-}
{-# OPTIONS_GHC -w #-}
module PackageInfo_space_war (
    name,
    version,
    synopsis,
    copyright,
    homepage,
  ) where

import Data.Version (Version(..))
import Prelude

name :: String
name = "space_war"
version :: Version
version = Version [0,1,0,0] []

synopsis :: String
synopsis = "Game 2 ng\432\7901i ch\417i theo l\432\7907t, client-server (Haskell + WebSocket)"
copyright :: String
copyright = ""
homepage :: String
homepage = ""
