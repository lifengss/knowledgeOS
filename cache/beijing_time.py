"""北京时间时区定义。"""
from datetime import timedelta, tzinfo


class BeijingTime(tzinfo):
    """东八区北京时间。"""

    def utcoffset(self, dt):
        return timedelta(hours=8)

    def tzname(self, dt):
        return "CST"

    def dst(self, dt):
        return timedelta(0)
