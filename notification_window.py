import os
import sys
import threading
import traceback
import webbrowser
from threading import Thread
from PIL import Image
import qrcode
from PyQt5.QtWidgets import (QApplication, QMainWindow, QLabel, QPushButton, 
                            QVBoxLayout, QHBoxLayout, QFrame, QWidget, QLineEdit,
                            QSystemTrayIcon, QMenu, QAction)
from PyQt5.QtGui import QPixmap, QIcon, QFont
from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation

def create_notification_window(ip_address, port):
    """创建精美的系统通知弹窗，使用PyQt5实现"""
    # 创建一个新线程运行PyQt窗口，避免阻塞主程序
    def show_window():
        try:
            # 防止应用程序实例已经存在
            app = QApplication.instance()
            if app is None:
                app = QApplication(sys.argv)
            
            # 创建主窗口
            class NotificationWindow(QMainWindow):
                def __init__(self):
                    super().__init__()
                    self.setWindowTitle("Snap Solver AI")
                    
                    # 设置窗口大小 - 显著增大窗口尺寸
                    self.setFixedSize(600, 1100)
                    screen_geometry = app.desktop().screenGeometry()
                    x = (screen_geometry.width() - self.width()) // 2
                    y = (screen_geometry.height() - self.height()) // 2
                    self.move(x, y)
                    
                    # 设置窗口图标
                    self.app_icon = None
                    if os.path.exists("app.ico"):
                        self.app_icon = QIcon("app.ico")
                        self.setWindowIcon(self.app_icon)
                    
                    # 构建完整的访问URL
                    self.access_url = f"http://{ip_address}:{port}"
                    
                    # 设置窗口属性
                    self.setWindowFlags(Qt.WindowStaysOnTopHint)
                    
                    # 初始化系统托盘
                    self.tray_icon = None
                    
                    # 初始化界面
                    self.init_ui()
                    
                    # 创建系统托盘
                    self.create_tray_icon()
                
                def init_ui(self):
                    # 创建中央部件和布局
                    central_widget = QWidget()
                    central_widget.setStyleSheet("""
                        background-color: white;
                    """)
                    
                    main_layout = QVBoxLayout(central_widget)
                    main_layout.setContentsMargins(40, 40, 40, 40)
                    main_layout.setSpacing(30)
                    
                    # 标题区域
                    header_layout = QHBoxLayout()
                    
                    # 应用标题 - 增大字体
                    app_title = QLabel("Snap Solver AI")
                    app_title.setStyleSheet("""
                        font-size: 36px; 
                        font-weight: bold; 
                        color: #333333;
                    """)
                    header_layout.addWidget(app_title, 1)
                    
                    # 状态标签 - 增大
                    status_label = QLabel("已启动")
                    status_label.setStyleSheet("""
                        background-color: #4CAF50;
                        color: white;
                        font-size: 20px;
                        font-weight: bold;
                        border-radius: 15px;
                        padding: 8px 20px;
                    """)
                    header_layout.addWidget(status_label, 0, Qt.AlignRight)
                    
                    main_layout.addLayout(header_layout)
                    
                    # 服务信息提示 - 增大字体
                    service_info = QLabel("服务已启动，您可以通过以下方式访问：")
                    service_info.setStyleSheet("""
                        font-size: 22px;
                        color: #555555;
                        margin-top: 10px;
                    """)
                    main_layout.addWidget(service_info)
                    
                    # 二维码区域 - 确保正方形显示区域
                    qr_container = QFrame()
                    qr_container.setFixedWidth(400)  # 设置固定宽度
                    qr_container.setStyleSheet("""
                        background-color: white;
                        border: none;
                    """)
                    qr_container_layout = QVBoxLayout(qr_container)
                    qr_container_layout.setContentsMargins(0, 0, 0, 0)
                    qr_container_layout.setAlignment(Qt.AlignCenter)
                    
                    qr_frame = QFrame()
                    qr_frame.setFixedSize(400, 400)  # 设置固定正方形尺寸
                    qr_frame.setStyleSheet("""
                        background-color: white;
                        border: 3px solid #e0e0e0;
                        border-radius: 15px;
                    """)
                    qr_layout = QVBoxLayout(qr_frame)
                    qr_layout.setContentsMargins(20, 20, 20, 20)
                    qr_layout.setAlignment(Qt.AlignCenter)
                    
                    # 生成二维码
                    try:
                        qr = qrcode.QRCode(
                            version=1,
                            error_correction=qrcode.constants.ERROR_CORRECT_M,
                            box_size=10,
                            border=4,
                        )
                        qr.add_data(self.access_url)
                        qr.make(fit=True)
                        
                        # 转换为PIL图像
                        qr_img = qr.make_image(fill_color="black", back_color="white")
                        
                        # 确保二维码尺寸合适
                        qr_img = qr_img.resize((350, 350), Image.LANCZOS)
                        temp_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'temp_qr.png')
                        qr_img.save(temp_path)
                        
                        # 创建QR码标签 - 确保是正方形
                        qr_label = QLabel()
                        qr_label.setFixedSize(350, 350)
                        qr_label.setPixmap(QPixmap(temp_path))
                        qr_label.setAlignment(Qt.AlignCenter)
                        qr_label.setStyleSheet("border: none;")
                        qr_layout.addWidget(qr_label, 0, Qt.AlignCenter)
                        
                        # 删除临时文件
                        try:
                            os.remove(temp_path)
                        except:
                            pass
                    except Exception as e:
                        print(f"生成二维码失败: {e}")
                        # 失败时显示提示文本
                        qr_label = QLabel("二维码生成失败")
                        qr_label.setFixedSize(350, 350)
                        qr_label.setAlignment(Qt.AlignCenter)
                        qr_label.setStyleSheet("""
                            border: 1px solid #e0e0e0;
                            color: #666666;
                            font-size: 22px;
                        """)
                        qr_layout.addWidget(qr_label, 0, Qt.AlignCenter)
                    
                    qr_container_layout.addWidget(qr_frame, 0, Qt.AlignCenter)
                    
                    # 扫码提示 - 增大字体
                    scan_label = QLabel("扫描二维码访问")
                    scan_label.setStyleSheet("""
                        color: #555555;
                        font-size: 22px;
                        margin-top: 15px;
                    """)
                    scan_label.setAlignment(Qt.AlignCenter)
                    qr_container_layout.addWidget(scan_label)
                    
                    main_layout.addWidget(qr_container, 0, Qt.AlignCenter)
                    
                    # 地址和复制按钮区域
                    url_frame = QFrame()
                    url_frame.setStyleSheet("""
                        background-color: #f5f5f5;
                        border-radius: 12px;
                        padding: 8px;
                    """)
                    url_layout = QHBoxLayout(url_frame)
                    url_layout.setContentsMargins(20, 15, 20, 15)
                    url_layout.setSpacing(15)
                    
                    # 地址文本框 - 增大字体
                    url_entry = QLineEdit(self.access_url)
                    url_entry.setReadOnly(True)
                    url_entry.setStyleSheet("""
                        QLineEdit {
                            background-color: #f5f5f5;
                            border: none;
                            font-size: 22px;
                            color: #333333;
                            padding: 10px;
                        }
                    """)
                    url_entry.setMinimumWidth(350)
                    url_layout.addWidget(url_entry)
                    
                    # 复制按钮 - 增大
                    copy_btn = QPushButton("复制")
                    copy_btn.setStyleSheet("""
                        QPushButton {
                            background-color: #2196F3;
                            color: white;
                            border: none;
                            border-radius: 8px;
                            padding: 10px 25px;
                            font-size: 20px;
                            font-weight: bold;
                        }
                        QPushButton:hover {
                            background-color: #1976D2;
                        }
                        QPushButton:pressed {
                            background-color: #0D47A1;
                        }
                    """)
                    copy_btn.setCursor(Qt.PointingHandCursor)
                    copy_btn.clicked.connect(self.copy_url)
                    self.copy_btn = copy_btn
                    url_layout.addWidget(copy_btn)
                    
                    main_layout.addWidget(url_frame)
                    
                    # IP信息
                    ip_layout = QHBoxLayout()
                    ip_layout.setContentsMargins(10, 5, 10, 5)
                    
                    ip_icon = QLabel("🖥️")
                    ip_icon.setStyleSheet("font-size: 22px;")
                    ip_layout.addWidget(ip_icon)
                    
                    # IP信息标签 - 增大字体
                    ip_info = QLabel(f"本地IP: {ip_address}")
                    ip_info.setStyleSheet("""
                        color: #666666;
                        font-size: 20px;
                    """)
                    ip_layout.addWidget(ip_info)
                    ip_layout.addStretch()
                    
                    main_layout.addLayout(ip_layout)
                    
                    # 操作按钮区域
                    button_layout = QHBoxLayout()
                    button_layout.setSpacing(20)
                    
                    # 在浏览器中打开按钮 - 增大
                    open_browser_btn = QPushButton("在浏览器中打开")
                    open_browser_btn.setStyleSheet("""
                        QPushButton {
                            background-color: #f5f5f5;
                            color: #333333;
                            border: 1px solid #e0e0e0;
                            border-radius: 8px;
                            padding: 15px 25px;
                            font-size: 20px;
                        }
                        QPushButton:hover {
                            background-color: #e0e0e0;
                        }
                    """)
                    open_browser_btn.setCursor(Qt.PointingHandCursor)
                    open_browser_btn.clicked.connect(self.open_in_browser)
                    button_layout.addWidget(open_browser_btn)
                    
                    # 关闭窗口按钮 - 增大
                    close_btn = QPushButton("关闭窗口")
                    close_btn.setStyleSheet("""
                        QPushButton {
                            background-color: #f5f5f5;
                            color: #333333;
                            border: 1px solid #e0e0e0;
                            border-radius: 8px;
                            padding: 15px 25px;
                            font-size: 20px;
                        }
                        QPushButton:hover {
                            background-color: #e0e0e0;
                        }
                    """)
                    close_btn.setCursor(Qt.PointingHandCursor)
                    close_btn.clicked.connect(self.hide)  # 改为隐藏窗口而不是关闭
                    button_layout.addWidget(close_btn)
                    
                    main_layout.addLayout(button_layout)
                    
                    # 提示信息 - 增大字体
                    tip_frame = QFrame()
                    tip_frame.setStyleSheet("""
                        background-color: #FFF8E1;
                        border-radius: 10px;
                        border: 1px solid #FFE082;
                        padding: 5px;
                    """)
                    tip_layout = QHBoxLayout(tip_frame)
                    tip_layout.setContentsMargins(15, 12, 15, 12)
                    
                    tip_icon = QLabel("💡")
                    tip_icon.setStyleSheet("font-size: 22px;")
                    tip_layout.addWidget(tip_icon)
                    
                    tip_text = QLabel("确保手机与电脑连接到同一网络才能访问")
                    tip_text.setStyleSheet("""
                        color: #FF8F00;
                        font-size: 20px;
                    """)
                    tip_layout.addWidget(tip_text)
                    
                    # 添加托盘提示
                    tray_info = QLabel("关闭窗口后，程序将在系统托盘中运行")
                    tray_info.setStyleSheet("""
                        color: #333333;
                        font-size: 16px;
                        font-style: italic;
                    """)
                    tray_info.setAlignment(Qt.AlignCenter)
                    main_layout.addWidget(tray_info)
                    
                    main_layout.addWidget(tip_frame)
                    
                    # 设置中央部件
                    self.setCentralWidget(central_widget)
                    
                    # 设置淡入效果
                    self.setWindowOpacity(0)
                    self.fade_in()
                
                def create_tray_icon(self):
                    """创建系统托盘图标和菜单"""
                    # 创建托盘图标
                    self.tray_icon = QSystemTrayIcon(self)
                    
                    # 设置图标
                    if self.app_icon:
                        self.tray_icon.setIcon(self.app_icon)
                    else:
                        # 如果没有自定义图标，使用默认图标
                        self.tray_icon.setIcon(QApplication.style().standardIcon(QApplication.style().SP_ComputerIcon))
                    
                    # 设置托盘提示文字
                    self.tray_icon.setToolTip("Snap Solver AI - 正在运行")
                    
                    # 创建托盘菜单
                    tray_menu = QMenu()
                    
                    # 添加复制链接选项
                    copy_action = QAction("复制链接", self)
                    copy_action.triggered.connect(self.copy_url)
                    tray_menu.addAction(copy_action)
                    
                    # 添加显示主窗口选项
                    show_action = QAction("显示主窗口", self)
                    show_action.triggered.connect(self.show)
                    tray_menu.addAction(show_action)
                    
                    # 添加分隔线
                    tray_menu.addSeparator()
                    
                    # 添加彻底隐藏托盘选项
                    hide_tray_action = QAction("彻底隐藏托盘", self)
                    hide_tray_action.triggered.connect(self.hide_tray)
                    tray_menu.addAction(hide_tray_action)
                    
                    # 添加分隔线
                    tray_menu.addSeparator()
                    
                    # 添加退出选项
                    quit_action = QAction("关闭程序", self)
                    quit_action.triggered.connect(self.quit_application)
                    tray_menu.addAction(quit_action)
                    
                    # 设置托盘菜单
                    self.tray_icon.setContextMenu(tray_menu)
                    
                    # 设置托盘图标点击行为
                    self.tray_icon.activated.connect(self.tray_icon_activated)
                    
                    # 显示托盘图标
                    self.tray_icon.show()
                
                def tray_icon_activated(self, reason):
                    """处理托盘图标激活事件"""
                    if reason == QSystemTrayIcon.DoubleClick:
                        # 双击显示主窗口
                        self.show()
                
                def closeEvent(self, event):
                    """重写关闭事件，当关闭窗口时，最小化到系统托盘"""
                    if self.tray_icon and self.tray_icon.isVisible():
                        self.hide()
                        event.ignore()
                    else:
                        event.accept()
                
                def hide_tray(self):
                    """彻底隐藏托盘图标，程序继续在后台运行"""
                    if self.tray_icon:
                        self.tray_icon.hide()
                
                def quit_application(self):
                    """彻底退出应用程序"""
                    QApplication.quit()
                
                def fade_in(self):
                    self.animation = QPropertyAnimation(self, b"windowOpacity")
                    self.animation.setDuration(250)
                    self.animation.setStartValue(0)
                    self.animation.setEndValue(1)
                    self.animation.start()
                
                def copy_url(self):
                    try:
                        # 将链接复制到剪贴板
                        clipboard = QApplication.clipboard()
                        clipboard.setText(self.access_url)
                        
                        # 如果当前按钮可见，则更新其状态
                        if hasattr(self, 'copy_btn') and self.copy_btn.isVisible():
                            # 显示复制成功
                            self.copy_btn.setText("已复制 ✓")
                            self.copy_btn.setStyleSheet("""
                                QPushButton {
                                    background-color: #4CAF50;
                                    color: white;
                                    border: none;
                                    border-radius: 8px;
                                    padding: 10px 25px;
                                    font-size: 20px;
                                    font-weight: bold;
                                }
                            """)
                            QTimer.singleShot(2000, self.reset_copy_button)
                        
                        # 如果托盘可见，通过托盘图标显示通知
                        if self.tray_icon and self.tray_icon.isVisible():
                            self.tray_icon.showMessage("复制成功", 
                                                      f"已复制链接: {self.access_url}", 
                                                      QSystemTrayIcon.Information, 
                                                      2000)
                    except Exception as e:
                        print(f"复制链接失败: {e}")
                
                def reset_copy_button(self):
                    if hasattr(self, 'copy_btn') and self.copy_btn.isVisible():
                        self.copy_btn.setText("复制")
                        self.copy_btn.setStyleSheet("""
                            QPushButton {
                                background-color: #2196F3;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                padding: 10px 25px;
                                font-size: 20px;
                                font-weight: bold;
                            }
                            QPushButton:hover {
                                background-color: #1976D2;
                            }
                            QPushButton:pressed {
                                background-color: #0D47A1;
                            }
                        """)
                
                def open_in_browser(self):
                    try:
                        webbrowser.open(self.access_url)
                    except Exception as e:
                        print(f"打开浏览器失败: {e}")
                
                def keyPressEvent(self, event):
                    # 按ESC键关闭窗口
                    if event.key() == Qt.Key_Escape:
                        self.hide()
                    else:
                        super().keyPressEvent(event)
            
            # 创建并显示窗口
            window = NotificationWindow()
            window.show()
            
            # 执行应用程序
            app.exec_()
            
        except Exception as e:
            print(f"创建通知窗口时出错: {e}")
            traceback.print_exc()
    
    # 创建并启动线程
    window_thread = Thread(target=show_window)
    window_thread.daemon = True  # 设置为守护线程，这样主程序退出时线程也会退出
    window_thread.start()

# 如果直接运行此文件，则显示一个测试窗口
if __name__ == "__main__":
    create_notification_window("127.0.0.1", 5000)
    # 等待足够长的时间以便查看窗口
    import time
    time.sleep(300)  # 5分钟 