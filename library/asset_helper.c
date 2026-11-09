#include "asset_helper.h"
#include "constants.h"

asset_t *create_background_from_info(background_info_t info)
{
  asset_t *background_asset = asset_make_image(info.bg_path, info.bg_box);
  return background_asset;
}

asset_t *create_text_from_info(text_info_t info)
{
  asset_t *text_asset = NULL;
  if (info.font_path != NULL)
  {
    text_asset = asset_make_text(info.font_path, info.text_box, info.text,
                                 info.text_color);
  }
  return text_asset;
}

/**
 * Centers a button label on the button face, shrinking it (keeping its
 * proportions) if it is too big to fit comfortably.
 *
 * @param text the label's bounding box, at its natural size; updated in place
 * @param button the button image's bounding box
 */
static void fit_text_to_button(SDL_Rect *text, SDL_Rect button)
{
  double max_w = button.w * BUTTON_TEXT_MAX_WIDTH;
  double max_h = button.h * BUTTON_TEXT_MAX_HEIGHT;
  double scale = 1.0;
  if (text->w > max_w)
  {
    scale = max_w / text->w;
  }
  if (text->h * scale > max_h)
  {
    scale = max_h / text->h;
  }
  text->w = (int)(text->w * scale);
  text->h = (int)(text->h * scale);
  // the face of the button art sits slightly above its drop shadow
  double face_h = button.h * BUTTON_FACE_HEIGHT;
  text->x = button.x + (button.w - text->w) / 2;
  text->y = button.y + (int)((face_h - text->h) / 2);
}

asset_t *create_button_from_info(button_info_t info)
{
  asset_t *image_asset = NULL;
  if (info.image_path != NULL)
  {
    image_asset = asset_make_image(info.image_path, info.image_box);
  }
  asset_t *text_asset = NULL;
  if (info.font_path != NULL)
  {
    text_asset = asset_make_text(info.font_path, info.text_box, info.text,
                                 info.text_color);
  }
  if (text_asset != NULL)
  {
    fit_text_to_button(&text_asset->bounding_box, info.image_box);
  }
  asset_t *button_asset =
      asset_make_button(info.image_box, image_asset, text_asset, info.handler);
  asset_cache_register_button(button_asset);
  return button_asset;
}