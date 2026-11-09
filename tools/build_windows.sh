#!/bin/sh
# Cross-compiles THON Jetpack TECHride into a Windows .exe from macOS/Linux and zips it
# with its DLLs and assets into dist/THON-Jetpack-TECHride-Windows.zip.
#
#   brew install mingw-w64      (or apt install mingw-w64)
#   make exe
#
# SDL libraries are downloaded once into build/win/ (official MinGW builds).
# Pass --fetch-only to just download them.
set -e
cd "$(dirname "$0")/.."

CC=x86_64-w64-mingw32-gcc
WINDRES=x86_64-w64-mingw32-windres
SDL_VER=2.30.9
IMG_VER=2.8.2
TTF_VER=2.22.0

FETCH_ONLY=0
[ "$1" = "--fetch-only" ] && FETCH_ONLY=1
[ $FETCH_ONLY = 1 ] || command -v $CC >/dev/null || { echo "Missing $CC -- run: brew install mingw-w64"; exit 1; }

BUILD=build/win
SYS=$BUILD/sysroot
mkdir -p $BUILD/dl $SYS

fetch() { # url file
  [ -f "$BUILD/dl/$2" ] || curl -fL --retry 3 -o "$BUILD/dl/$2" "$1"
}

if [ ! -f $SYS/.ready ]; then
  echo "Downloading SDL libraries..."
  fetch https://github.com/libsdl-org/SDL/releases/download/release-$SDL_VER/SDL2-devel-$SDL_VER-mingw.tar.gz sdl2.tgz
  fetch https://github.com/libsdl-org/SDL_image/releases/download/release-$IMG_VER/SDL2_image-devel-$IMG_VER-mingw.tar.gz sdl2_image.tgz
  fetch https://github.com/libsdl-org/SDL_ttf/releases/download/release-$TTF_VER/SDL2_ttf-devel-$TTF_VER-mingw.tar.gz sdl2_ttf.tgz
  for f in sdl2 sdl2_image sdl2_ttf; do
    rm -rf $BUILD/src_$f && mkdir -p $BUILD/src_$f
    # only the 64-bit MinGW parts are needed
    tar -xzf $BUILD/dl/$f.tgz -C $BUILD/src_$f --strip-components 1 '*/x86_64-w64-mingw32/*'
    cp -R $BUILD/src_$f/x86_64-w64-mingw32/. $SYS/
    rm -rf $BUILD/src_$f
  done
  touch $SYS/.ready
fi

[ $FETCH_ONLY = 1 ] && { echo "SDL libraries ready in $SYS"; exit 0; }

OUT=dist/THON-Jetpack-TECHride-Windows
rm -rf $OUT && mkdir -p $OUT

# app icon from the default character sprite
python3 -I - <<'EOF'
from PIL import Image
im = Image.open("assets/characters/robot.png").convert("RGBA")
im.save("build/win/icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
EOF
echo '1 ICON "icon.ico"' > $BUILD/icon.rc
$WINDRES $BUILD/icon.rc -O coff -o $BUILD/icon.o

echo "Compiling..."
$CC -O2 -Wall -Iinclude -I$SYS/include -I$SYS/include/SDL2 \
  demo/*.c library/*.c \
  $BUILD/icon.o \
  -L$SYS/lib -lmingw32 -lSDL2main -lSDL2 -lSDL2_image -lSDL2_ttf -lm \
  -mwindows -static-libgcc \
  -o "$OUT/THON-Jetpack-TECHride.exe"

cp $SYS/bin/SDL2.dll $SYS/bin/SDL2_image.dll $SYS/bin/SDL2_ttf.dll $OUT/
# the release DLLs ship with debug symbols; stripping shrinks SDL2_ttf.dll ~68MB -> ~2MB
x86_64-w64-mingw32-strip --strip-unneeded $OUT/*.dll "$OUT/THON-Jetpack-TECHride.exe"
cp -R assets $OUT/assets
find $OUT -name .DS_Store -delete
cat > $OUT/README.txt <<'EOF'
THON Jetpack TECHride -- FOR THE KIDS

Double-click THON-Jetpack-TECHride.exe to play. Keep the .dll files and the
assets folder next to the .exe.

Hold SPACE to fly. Pick your runner in Settings.

If Windows SmartScreen warns about an unknown publisher, click
"More info" -> "Run anyway" (the .exe isn't code-signed).
EOF

(cd dist && rm -f THON-Jetpack-TECHride-Windows.zip && zip -qr THON-Jetpack-TECHride-Windows.zip THON-Jetpack-TECHride-Windows)
echo "Built dist/THON-Jetpack-TECHride-Windows.zip"
