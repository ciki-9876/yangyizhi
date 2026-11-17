package app.yangyizhi.mobile;

import com.getcapacitor.BridgeActivity;
import app.yangyizhi.mobile.updates.YangyizhiUpdatesPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(YangyizhiUpdatesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
