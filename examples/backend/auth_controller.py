"""示例路由文件：通过路径与函数结构学习职责划分，不依赖外部框架。"""
from auth_service import validate_login


def login(request):
    """请求入口：接收输入，调用服务，并返回结果。"""
    username = request.get("username", "")
    password = request.get("password", "")
    return validate_login(username, password)


if __name__ == "__main__":
    print(login({"username": "learner", "password": "demo"}))
