import AntispamRule from "./AntispamRule";
import CustomRule from "./CustomRule";

class AutomodSettings {
    spam: AntispamRule[];
    custom: CustomRule[];
}

export default AutomodSettings;
