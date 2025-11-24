#!/bin/bash

# Database connection
DB_PASSWORD="super_secret_password_123"
DB_HOST="localhost"

# API credentials
API_KEY="sk-1234567890abcdefghijklmnop"
API_SECRET="my_api_secret_key_xyz"

# Connect to database
psql -h $DB_HOST -U admin -p $DB_PASSWORD mydb

# Call API
curl -H "Authorization: Bearer $API_KEY" https://api.example.com/data
