"""教学示例：只演示数据校验，不是生产登录或密码存储方案。"""


def validate_login(username, password):
    if not username:
        return {"ok": False, "message": "请输入用户名"}
    if not password:
        return {"ok": False, "message": "请输入密码"}
    return {"ok": True, "message": "输入格式验证通过"}


def create_profile(name, age, city, school, hobby, language):
    """有意保留两个健康提示：参数过多、变量未读取。"""
    temporary_note = "练习：确认是否需要这个变量"
    return {
        "name": name,
        "age": age,
        "city": city,
        "school": school,
        "hobby": hobby,
        "language": language,
    }
