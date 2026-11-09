# THON Jetpack TECHride build
#
#   make web      build the website into web/  (needs Emscripten: brew install emscripten)
#   make serve    serve web/ at http://localhost:8000
#   make game     web + serve
#   make exe      build the Windows .exe zip into dist/  (needs: brew install mingw-w64)
#   make clean    remove build output

GAMES = game home settings game_play game_over
LIBS_SRC = asset_cache asset body collision color emscripten forces list polygon \
           scene sdl_wrapper vector constants asset_helper observer subject \
           achievement screen_helper game_play_helper character leaderboard particles manifest game_settings cosmetics

WASM_OBJS = $(addprefix out/,$(GAMES:=.wasm.o)) $(addprefix out/,$(LIBS_SRC:=.wasm.o))
ASSETS = $(shell find assets -type f ! -name '.DS_Store')

CFLAGS = -Iinclude -Wall -O2
# test builds: make web CFLAGS="-Iinclude -Wall -O2 -DGAME_TEST" TEST_EXPORTS=',"_web_test_powerup","_web_test_spawn"'
TEST_EXPORTS =

# Emscripten (website) settings
EMCC = emcc
EMCC_PORTS = -s USE_SDL=2 -s USE_SDL_IMAGE=2 \
             -s SDL2_IMAGE_FORMATS='["png"]' -s USE_SDL_TTF=2
EMCC_FLAGS = $(EMCC_PORTS) -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=268435456 \
             -s EXIT_RUNTIME=1 -s FORCE_FILESYSTEM=1 -O2 \
             --use-preload-plugins --preload-file assets --exclude-file '*.DS_Store' \
             --shell-file tools/shell.html \
             -sEXPORTED_FUNCTIONS='["_main","_web_play","_web_menu","_web_saves_ready","_web_character_count","_web_character_selected","_web_character_select","_web_difficulty","_web_set_difficulty","_web_background","_web_set_background","_web_set_particles","_web_set_player_name","_web_cosmetic","_web_set_cosmetic","_web_stats","_web_set_debug_hitboxes"$(TEST_EXPORTS)]' \
             -sEXPORTED_RUNTIME_METHODS='["ccall","FS","HEAP8"]' \
             -lidbfs.js

.PHONY: web serve game exe clean

web: web/index.html

web/index.html: $(WASM_OBJS) $(ASSETS) tools/shell.html
	@mkdir -p web
	$(EMCC) $(EMCC_FLAGS) $(WASM_OBJS) -o $@
	@# the menu pages show the same files the game loads, plus site art
	@rm -rf web/assets web/site && mkdir -p web/site/sheets
	@cp -R assets web/assets && find web/assets -name .DS_Store -delete
	@cp art_src/site/tub_hero.png web/site/
	@cp new_assets/*.png web/site/sheets/ 2>/dev/null || true
	@echo "Built web/ -- run 'make serve', or upload the web/ folder to any static host."

out/%.wasm.o: library/%.c
	@mkdir -p out
	$(EMCC) -c $(CFLAGS) $(EMCC_PORTS) $< -o $@
out/%.wasm.o: demo/%.c
	@mkdir -p out
	$(EMCC) -c $(CFLAGS) $(EMCC_PORTS) $< -o $@

serve:
	@echo "Open \033[0;32mhttp://localhost:8000/\033[0m to play THON Jetpack TECHride"
	@cd web && python3 -m http.server 8000

game: web serve

exe:
	sh tools/build_windows.sh

clean:
	rm -rf out/*.o web dist build

.PRECIOUS: out/%.wasm.o
