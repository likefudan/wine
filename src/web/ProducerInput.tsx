import type { PlaceDetails } from "../shared/model";
import { t } from "./i18n";
import { PlaceInput } from "./PlaceInput";

/** 酒庄 field: Google Places suggestions, wineries first. */
export function ProducerInput(props: {
  value: string;
  onInput: (v: string) => void;
  onPlace: (p: PlaceDetails) => void;
}) {
  return <PlaceInput label={t("酒庄")} kind="winery" placeholder="Ridge Vineyards" {...props} />;
}
