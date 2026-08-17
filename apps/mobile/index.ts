import { registerRootComponent } from "expo";
import * as WebBrowser from "expo-web-browser";
import { App } from "./src/App";

WebBrowser.maybeCompleteAuthSession();
registerRootComponent(App);
