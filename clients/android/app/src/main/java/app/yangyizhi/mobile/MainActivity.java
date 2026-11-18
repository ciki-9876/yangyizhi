package app.yangyizhi.mobile;

import com.getcapacitor.BridgeActivity;
import app.yangyizhi.mobile.updates.YangyizhiUpdatesPlugin;
import app.yangyizhi.mobile.calendar.YangyizhiCalendarPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(YangyizhiUpdatesPlugin.class);
        registerPlugin(YangyizhiCalendarPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
