#!/usr/bin/env python3
"""
自动归档演示测试 / Auto Archive Demo
=====================================
本文件用于验证 auto_test_runner.py 的检测→运行→归档链路。
"""

import unittest


class TestAutoArchiveDemo(unittest.TestCase):
    """验证自动归档机制的演示测试集。"""

    def test_demo_passing_case(self):
        """正常流：演示用例通过，应被归档为 PASSED。

        异常流：若断言失败则归档为 FAILED。
        优先级: P2
        """
        self.assertEqual(1 + 1, 2)

    def test_demo_another_passing_case(self):
        """正常流：另一个通过用例，验证批量归档。

        优先级: P2
        """
        self.assertTrue(len("hello") > 0)


if __name__ == "__main__":
    unittest.main()
