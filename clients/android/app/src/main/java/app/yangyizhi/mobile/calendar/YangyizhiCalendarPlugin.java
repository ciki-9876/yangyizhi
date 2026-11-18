package app.yangyizhi.mobile.calendar;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 把「下一小步」加进系统日历：调起日历应用的新建事件页，由用户确认保存。
 * 不读写日历数据，所以不需要日历权限。
 */
@CapacitorPlugin(name = "YangyizhiCalendar")
public class YangyizhiCalendarPlugin extends Plugin {
    @PluginMethod
    public void insert(PluginCall call) {
        String title = call.getString("title", "");
        String notes = call.getString("notes", "");
        Double begin = call.getDouble("begin");
        Double end = call.getDouble("end");
        if (title.isEmpty() || begin == null || end == null) { call.reject("缺少日历事件信息"); return; }
        Intent intent = new Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, title)
            .putExtra(CalendarContract.Events.DESCRIPTION, notes)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin.longValue())
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.longValue())
            .putExtra(CalendarContract.Events.HAS_ALARM, 1);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("这台手机上没有可用的日历应用");
        }
    }
}
