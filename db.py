import mysql.connector

def get_db():
    try:
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="",
            database="college_system"
        )
        return conn

    except Exception as e:
        print("DB CONNECTION ERROR:", e)
        return None