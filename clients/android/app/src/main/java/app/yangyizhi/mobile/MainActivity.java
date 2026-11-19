package app.yangyizhi.mobile;

import com.getcapacitor.BridgeActivity;
import app.yangyizhi.mobile.updates.YangyizhiUpdatesPlugin;
import app.yangyizhi.mobile.calendar.YangyizhiCalendarPlugin;
import app.yangyizhi.mobile.cloud.YangyizhiCloudPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(YangyizhiUpdatesPlugin.class);
        registerPlugin(YangyizhiCalendarPlugin.class);
        registerPlugin(YangyizhiCloudPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
